// Package gameconfig is the game_settings feature module (core/07 §7, LV8):
// it keeps a copy of the settings files of the game per profile and puts
// the copy of the profile just deployed in the game in the post step of the
// deploy, applies the INI tweaks the mods bring over the file in effect,
// and checks the keys the game needs for mods to work.
//
// The module enters the core through contribution points (D133): it is a
// deployment.PostDeploy, a diagnostics.Module and a profiles.Copier. The
// core never names it. Which files a game has, which keys it needs and
// which files of a mod are tweaks are the adapter's
// (ports.GameSettingsSupport); a game without the capability gets nothing
// from this module.
package gameconfig

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"maps"
	"path"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/games"
	"modorchestrator/internal/core/application/instancelock"
	"modorchestrator/internal/core/application/operations"
	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/gameini"
	"modorchestrator/internal/core/domain/gamesettings"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/profile"
)

// Error codes (core/00 §6, INV-OPS-05).
const (
	CodeUnsupported      = "game_settings_unsupported"
	CodeInstanceNotFound = "instance_not_found"
	CodeProfileNotFound  = "profile_not_found"
	CodeModNotFound      = "mod_not_found"
	CodeTweakNotFound    = "ini_tweak_not_found"
	CodeFileLocked       = "game_settings_file_locked"
	CodeIOError          = "game_settings_io_error"
)

// Events.
const (
	EventApplied              event.Type = "game_settings.applied"
	EventLocalSettingsChanged event.Type = "profile.local_settings_changed"
	EventTweakChanged         event.Type = "game_settings.tweak_changed"
	EventRequiredFixed        event.Type = "game_settings.required_fixed"
)

const (
	subjectInstance = "instance"
	subjectProfile  = "profile"
	subjectMod      = "mod"
	holder          = "game_settings"
)

// Error is a coded error of the module.
type Error struct {
	code   string
	cause  error
	params map[string]string
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("game settings: %s: %v", e.code, e.cause)
	}
	return "game settings: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return maps.Clone(e.params) }

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

// Deps are the ports the module needs.
type Deps struct {
	Registry      *games.Registry
	Instances     ports.GameInstances
	Profiles      ports.Profiles
	Mods          ports.Mods
	Installations ports.Installations
	Manifests     ports.Manifests
	GameSettings  ports.GameSettings
	UoW           ports.UnitOfWork
	Publisher     operations.Publisher
	FS            ports.FileSystem
	Folders       ports.KnownFolders
	Locks         *instancelock.Locks
	IDs           operations.IDGenerator
	Clock         operations.Clock
}

// Service implements the game settings use cases.
type Service struct{ Deps }

// NewService wires the service.
func NewService(d Deps) *Service {
	if d.Locks == nil {
		d.Locks = instancelock.New()
	}
	return &Service{Deps: d}
}

// support is the instance with its settings contract, when the feature is
// in effect for it (D115).
type support struct {
	inst     game.Instance
	gs       ports.GameSettingsSupport
	files    []gamesettings.File
	required []gamesettings.Required
}

func (sp *support) file(p string) (gamesettings.File, bool) {
	for _, f := range sp.files {
		if gamesettings.Same(f.Path, p) {
			return f, true
		}
	}
	return gamesettings.File{}, false
}

func (s *Service) support(ctx context.Context, instance game.InstanceID) (*support, error) {
	inst, err := s.Instances.Get(ctx, instance)
	if errors.Is(err, ports.ErrNotFound) {
		return nil, fail(CodeInstanceNotFound, err, "instance", string(instance))
	}
	if err != nil {
		return nil, err
	}
	adapter, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return nil, fail(CodeUnsupported, nil, "game", string(inst.Game))
	}
	def, err := ports.InstanceDefinition(adapter, inst)
	if err != nil {
		return nil, err
	}
	gs, ok := adapter.(ports.GameSettingsSupport)
	if !ok || !def.Capabilities.Has(game.CapGameSettings) {
		return nil, fail(CodeUnsupported, nil, "game", string(inst.Game))
	}
	sp := &support{inst: inst, gs: gs}
	for _, f := range gs.SettingsFiles(inst) {
		if f.Valid() {
			sp.files = append(sp.files, f)
		}
	}
	if len(sp.files) == 0 {
		return nil, fail(CodeUnsupported, nil, "game", string(inst.Game))
	}
	for _, r := range gs.RequiredSettings(inst) {
		if _, known := sp.file(r.File); r.Valid() && known {
			sp.required = append(sp.required, r)
		}
	}
	return sp, nil
}

// Supported reports whether the feature is in effect for an instance.
func (s *Service) Supported(ctx context.Context, instance game.InstanceID) bool {
	_, err := s.support(ctx, instance)
	return err == nil
}

func unsupported(err error) bool {
	var e *Error
	return errors.As(err, &e) && e.code == CodeUnsupported
}

func (s *Service) commit(ctx context.Context, fn func(ctx context.Context, tx ports.Tx) error) error {
	stored, err := s.UoW.Do(ctx, fn)
	if err != nil {
		return err
	}
	if len(stored) > 0 {
		s.Publisher.Publish(stored...)
	}
	return nil
}

func (s *Service) newEvent(t event.Type, kind, id string, payload map[string]string) event.Event {
	if payload == nil {
		payload = map[string]string{}
	}
	return event.Event{ID: s.IDs.NewID(), Type: t, OccurredAt: s.Clock.Now(), Subject: event.EntityRef{Kind: kind, ID: id}, Payload: payload}
}

// opError turns a coded error into an operation error.
func opError(err error) error {
	var e *Error
	if errors.As(err, &e) {
		return &operation.Error{Code: e.code, Message: e.Error(), Params: e.params}
	}
	return err
}

func fileError(err error, p string) error {
	if errors.Is(err, ports.ErrFileLocked) || errors.Is(err, ports.ErrPermission) {
		return fail(CodeFileLocked, err, "path", p)
	}
	return fail(CodeIOError, err, "path", p)
}

// observed is a settings file as found now.
type observed struct {
	path       string
	exists     bool
	unreadable bool
	data       []byte
}

func (s *Service) abs(f gamesettings.File) (string, error) {
	base, err := s.Folders.Folder(f.Folder)
	if err != nil {
		return "", err
	}
	return game.JoinPath(base, f.Path), nil
}

func (s *Service) read(ctx context.Context, f gamesettings.File) (observed, error) {
	p, err := s.abs(f)
	if err != nil {
		return observed{}, err
	}
	o := observed{path: p}
	info, err := s.FS.Stat(ctx, p)
	if err != nil {
		o.unreadable = true
		return o, nil
	}
	if !info.Exists {
		return o, nil
	}
	o.exists = true
	r, err := s.FS.Open(ctx, p)
	if err != nil {
		o.unreadable = true
		return o, nil
	}
	defer r.Close()
	if o.data, err = io.ReadAll(io.LimitReader(r, 4<<20)); err != nil {
		o.unreadable = true
	}
	return o, nil
}

// write puts content in the game file, or removes the file when the content
// stands for "no file".
func (s *Service) write(ctx context.Context, o observed, present bool, data []byte) error {
	if !present {
		if !o.exists {
			return nil
		}
		if err := s.FS.Remove(ctx, o.path); err != nil {
			return fileError(err, o.path)
		}
		return nil
	}
	if err := s.FS.MkdirAll(ctx, parentDir(o.path)); err != nil {
		return fileError(err, o.path)
	}
	if err := s.FS.WriteFile(ctx, o.path, data); err != nil {
		return fileError(err, o.path)
	}
	return nil
}

// backup keeps a copy of a settings file in the BackupStore (never
// overwritten) and returns its path relative to the store.
func (s *Service) backup(ctx context.Context, sp *support, o observed, why string) (string, error) {
	dir := game.JoinPath(sp.inst.BackupStore, "game_settings")
	if err := s.FS.MkdirAll(ctx, dir); err != nil {
		return "", fileError(err, dir)
	}
	name := path.Base(strings.ReplaceAll(o.path, `\`, "/"))
	ext := path.Ext(name)
	name = strings.TrimSuffix(name, ext) + "-" + why + "-" + s.Clock.Now().UTC().Format("20060102T150405") + ext
	p := game.JoinPath(dir, name)
	for i := 1; ; i++ {
		info, err := s.FS.Stat(ctx, p)
		if err != nil || !info.Exists {
			break
		}
		p = game.JoinPath(dir, name+".backup"+strconv.Itoa(i))
	}
	if err := s.FS.WriteFile(ctx, p, o.data); err != nil {
		return "", fileError(err, p)
	}
	return "game_settings/" + path.Base(strings.ReplaceAll(p, `\`, "/")), nil
}

// hashOf is the evidence of a file content ("absent" for no file).
func hashOf(present bool, data []byte) string {
	if !present {
		return "absent"
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func lookup(data []byte, section, key string) gamesettings.Value {
	if v, ok := gameini.Lookup(data, section, key); ok {
		return gamesettings.Text(v)
	}
	return gamesettings.Absent
}

func setValue(data []byte, section, key string, v gamesettings.Value) []byte {
	if v.Present {
		return gameini.Set(data, section, key, v.Text)
	}
	return gameini.Remove(data, section, key)
}

func (s *Service) activeProfile(ctx context.Context, instance game.InstanceID) (*profile.Profile, error) {
	pid, err := s.Profiles.Active(ctx, instance)
	if err != nil {
		return nil, err
	}
	return s.Profiles.Get(ctx, pid)
}

// deployed is the profile in the game folder now (nil after a purge or
// before the first deploy).
func (s *Service) deployed(ctx context.Context, instance game.InstanceID) *profile.Profile {
	if s.Manifests == nil {
		return nil
	}
	h, err := s.Manifests.Header(ctx, instance)
	if err != nil || h.Purged() {
		return nil
	}
	p, err := s.Profiles.Get(ctx, profile.ID(h.Profile))
	if err != nil {
		return nil
	}
	return p
}

// parentDir is the folder of an absolute path (either separator).
func parentDir(p string) string {
	i := strings.LastIndexAny(p, `/\`)
	if i <= 0 {
		return p
	}
	return p[:i]
}

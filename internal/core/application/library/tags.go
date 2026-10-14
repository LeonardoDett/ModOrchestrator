package library

import (
	"context"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/mod"
)

// Event of a change to the tag definitions (history and UI refresh).
const EventTagChanged = "library.tag_changed"

// TagView is a tag of the instance with how many mods carry it (D123).
type TagView struct {
	Name  string
	Color string
	Order int
	Mods  int
}

// TagList returns the tags of the instance: the defined ones in their
// order, then the names some mod carries without a definition (no color),
// so a tag typed on a mod is never lost.
func (s *Service) TagList(ctx context.Context, instance game.InstanceID) ([]TagView, error) {
	defs, err := s.tagDefs(ctx, instance)
	if err != nil {
		return nil, err
	}
	mods, err := s.Mods.ListByInstance(ctx, instance)
	if err != nil {
		return nil, err
	}
	out := make([]TagView, 0, len(defs))
	for _, t := range defs {
		out = append(out, TagView{Name: t.Name, Color: t.Color, Order: t.Order})
	}
	index := func(name string) int {
		return slices.IndexFunc(out, func(v TagView) bool { return mod.SameTag(v.Name, name) })
	}
	for _, m := range mods {
		if m.State == mod.StateRemoved {
			continue
		}
		for _, name := range m.Attributes.Tags {
			i := index(name)
			if i < 0 {
				out = append(out, TagView{Name: name, Order: len(out)})
				i = len(out) - 1
			}
			out[i].Mods++
		}
	}
	return out, nil
}

func (s *Service) tagDefs(ctx context.Context, instance game.InstanceID) ([]mod.Tag, error) {
	if s.Tags == nil {
		return nil, nil
	}
	return s.Tags.List(ctx, instance)
}

// TagInput creates, renames or recolors a tag. Name is the current name
// (empty or unknown to create); NewName renames when set.
type TagInput struct {
	Name    string
	NewName string
	Color   string
}

// SaveTag defines a tag or edits one. Renaming changes the name on every
// mod that carries it, in the same transaction; a rename onto another
// existing tag is refused (merge is not a rename).
func (s *Service) SaveTag(ctx context.Context, instance game.InstanceID, in TagInput) (string, error) {
	current := strings.TrimSpace(in.Name)
	target := in.NewName
	if strings.TrimSpace(target) == "" {
		target = current
	}
	name, err := mod.NormalizeTag(target)
	if err != nil {
		return "", fail(CodeNameEmpty, err)
	}
	if !mod.ValidColor(in.Color) {
		return "", fail(CodeTagInvalid, nil, "tag", name)
	}
	defs, err := s.tagDefs(ctx, instance)
	if err != nil {
		return "", err
	}
	i := slices.IndexFunc(defs, func(t mod.Tag) bool { return current != "" && mod.SameTag(t.Name, current) })
	clash := slices.IndexFunc(defs, func(t mod.Tag) bool { return mod.SameTag(t.Name, name) })
	if clash >= 0 && clash != i {
		return "", fail(CodeTagExists, nil, "tag", name)
	}
	if current != "" && !mod.SameTag(current, name) {
		// A name only some mod carries is a tag too: renaming onto it would merge.
		all, err := s.TagList(ctx, instance)
		if err != nil {
			return "", err
		}
		if slices.ContainsFunc(all, func(v TagView) bool { return mod.SameTag(v.Name, name) }) {
			return "", fail(CodeTagExists, nil, "tag", name)
		}
	}
	renamed := current != "" && current != name
	if i < 0 {
		defs = append(defs, mod.Tag{Name: name, Color: in.Color, Order: len(defs)})
	} else {
		defs[i].Name, defs[i].Color = name, in.Color
	}
	now := s.Clock.Now()
	return name, s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if renamed {
			if err := s.retag(ctx, tx, instance, current, name, now); err != nil {
				return err
			}
		}
		tx.Emit(s.newEvent(EventTagChanged, subjectInstance, string(instance), "", map[string]string{"tag": name, "previous": current}))
		return tx.Tags().Replace(ctx, instance, defs)
	})
}

// DeleteTag removes a tag definition and the name from every mod.
func (s *Service) DeleteTag(ctx context.Context, instance game.InstanceID, name string) error {
	defs, err := s.tagDefs(ctx, instance)
	if err != nil {
		return err
	}
	defs = slices.DeleteFunc(defs, func(t mod.Tag) bool { return mod.SameTag(t.Name, name) })
	for i := range defs {
		defs[i].Order = i
	}
	now := s.Clock.Now()
	return s.commit(ctx, func(ctx context.Context, tx ports.Tx) error {
		if err := s.retag(ctx, tx, instance, name, "", now); err != nil {
			return err
		}
		tx.Emit(s.newEvent(EventTagChanged, subjectInstance, string(instance), "", map[string]string{"tag": "", "previous": name}))
		return tx.Tags().Replace(ctx, instance, defs)
	})
}

// retag renames (to != "") or removes (to == "") a tag on every mod of the
// instance that carries it.
func (s *Service) retag(ctx context.Context, tx ports.Tx, instance game.InstanceID, from, to string, now time.Time) error {
	mods, err := tx.Mods().ListByInstance(ctx, instance)
	if err != nil {
		return err
	}
	for _, m := range mods {
		if !slices.ContainsFunc(m.Attributes.Tags, func(t string) bool { return mod.SameTag(t, from) }) {
			continue
		}
		a := m.Attributes
		var tags []string
		for _, t := range a.Tags {
			switch {
			case !mod.SameTag(t, from):
				tags = append(tags, t)
			case to != "" && !slices.ContainsFunc(tags, func(x string) bool { return mod.SameTag(x, to) }):
				tags = append(tags, to)
			}
		}
		a.Tags = tags
		if err := m.SetAttributes(a, now); err != nil {
			return err
		}
		if err := tx.Mods().Save(ctx, m); err != nil {
			return err
		}
	}
	return nil
}

// mergeTags adds names to tags without duplicates (case-insensitive),
// normalizing each; invalid names are skipped.
func mergeTags(tags []string, add []string) []string {
	out := slices.Clone(tags)
	for _, a := range add {
		n, err := mod.NormalizeTag(a)
		if err != nil || slices.ContainsFunc(out, func(t string) bool { return mod.SameTag(t, n) }) {
			continue
		}
		out = append(out, n)
	}
	return out
}

// ExtensionCount is how many files (and bytes) of one extension the
// current installation of a mod has (D123: Arquivos by type, any game).
type ExtensionCount struct {
	// Ext is the lowercase extension with the dot (".dds"); "" for files
	// without one.
	Ext   string
	Files int
	Size  int64
}

// ExtensionCounts groups the installed files of a mod by extension, most
// files first. It reads no adapter data, so it works for every game.
func (s *Service) ExtensionCounts(ctx context.Context, id mod.ID) ([]ExtensionCount, error) {
	m, err := s.Mods.Get(ctx, id)
	if err != nil || m.State == mod.StateRemoved {
		return nil, fail("not_found", err, "mod", string(id))
	}
	if m.Installation == "" {
		return []ExtensionCount{}, nil
	}
	inst, err := s.Installations.Get(ctx, m.Installation)
	if err != nil {
		return nil, err
	}
	by := map[string]*ExtensionCount{}
	for _, f := range inst.Files {
		p := f.Dest.Path.String()
		ext := ""
		if i := strings.LastIndex(p, "."); i > strings.LastIndex(p, "/") && i < len(p)-1 {
			ext = strings.ToLower(p[i:])
		}
		c := by[ext]
		if c == nil {
			c = &ExtensionCount{Ext: ext}
			by[ext] = c
		}
		c.Files++
		c.Size += f.Size
	}
	out := make([]ExtensionCount, 0, len(by))
	for _, c := range by {
		out = append(out, *c)
	}
	slices.SortFunc(out, func(a, b ExtensionCount) int {
		if a.Files != b.Files {
			return b.Files - a.Files
		}
		return strings.Compare(a.Ext, b.Ext)
	})
	return out, nil
}

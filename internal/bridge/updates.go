package bridge

import (
	"os"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"modorchestrator/internal/core/application/appupdate"
)

// App update (D104, Settings › Aplicação › Atualizações): transport only.

type UpdateNoteDTO struct {
	Version   string `json:"version"`
	Published string `json:"published,omitempty"`
	Text      string `json:"text"`
}

type UpdateOfferDTO struct {
	Version   string          `json:"version"`
	Published string          `json:"published,omitempty"`
	Size      int64           `json:"size"`
	Notes     []UpdateNoteDTO `json:"notes"`
}

type UpdateStatusDTO struct {
	Enabled    bool            `json:"enabled"`
	Channel    string          `json:"channel"`
	Installed  string          `json:"installed"`
	Checking   bool            `json:"checking"`
	CheckedAt  string          `json:"checkedAt,omitempty"`
	Offer      *UpdateOfferDTO `json:"offer,omitempty"`
	CheckError *Error          `json:"checkError,omitempty"`
	Installing bool            `json:"installing"`
	Done       int64           `json:"done"`
	Total      int64           `json:"total"`
	Launched   bool            `json:"launched"`
}

func stamp(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func toUpdateStatusDTO(s appupdate.Status) UpdateStatusDTO {
	out := UpdateStatusDTO{Enabled: s.Enabled, Channel: s.Channel, Installed: s.Installed, Checking: s.Checking,
		CheckedAt: stamp(s.CheckedAt), Installing: s.Installing, Done: s.Done, Total: s.Total, Launched: s.Launched}
	if s.Offer != nil {
		o := &UpdateOfferDTO{Version: s.Offer.Version, Published: stamp(s.Offer.Published), Size: s.Offer.Size, Notes: []UpdateNoteDTO{}}
		for _, n := range s.Offer.Notes {
			o.Notes = append(o.Notes, UpdateNoteDTO{Version: n.Version, Published: stamp(n.Published), Text: n.Text})
		}
		out.Offer = o
	}
	if s.CheckError != nil {
		out.CheckError = &Error{Code: s.CheckError.Code(), Params: s.CheckError.Params(), Detail: s.CheckError.Error()}
	}
	return out
}

// updates returns the update service, wiring it if Startup did not run.
func (a *App) updates() *appupdate.Service {
	if a.c.Updates == nil {
		exe, _ := os.Executable()
		a.c.EnableUpdates(Version, exe)
	}
	return a.c.Updates
}

// GetUpdateStatus returns the update status (nothing goes to the network).
func (a *App) GetUpdateStatus() (UpdateStatusDTO, error) {
	s, err := a.updates().Status(a.context())
	if err != nil {
		return UpdateStatusDTO{}, a.fail("update status", err, nil)
	}
	return toUpdateStatusDTO(s), nil
}

// CheckForUpdate asks for a newer version now ("Verificar agora"); refused
// with update_check_disabled while app.updateCheck is off.
func (a *App) CheckForUpdate() (UpdateStatusDTO, error) {
	s, err := a.updates().Check(a.context())
	if err != nil {
		return UpdateStatusDTO{}, a.fail("check for update", err, nil)
	}
	return toUpdateStatusDTO(s), nil
}

// InstallUpdate downloads and checks the offered version, starts its
// installer and closes the app.
func (a *App) InstallUpdate(version string) error {
	if err := a.updates().Install(a.context(), version); err != nil {
		return a.fail("install update", err, map[string]string{"version": version})
	}
	a.c.Logger.Info("update installer started", "version", version)
	go func() {
		// Lets the UI read "launched" before the window closes.
		time.Sleep(300 * time.Millisecond)
		runtime.Quit(a.context())
	}()
	return nil
}

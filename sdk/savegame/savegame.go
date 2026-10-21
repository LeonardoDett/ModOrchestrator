// Package savegame is the save vocabulary of the adapter SDK (D134, D142):
// the names of internal/core/domain/savegame an adapter may use, as aliases.
package savegame

import (
	inner "modorchestrator/internal/core/domain/savegame"
)

type (
	Header     = inner.Header
	Kind       = inner.Kind
	Redirect   = inner.Redirect
	Screenshot = inner.Screenshot
)

const (
	KindManual = inner.KindManual
	KindQuick  = inner.KindQuick
	KindAuto   = inner.KindAuto
)

// Package game is the game vocabulary of the adapter SDK (D134): the
// names of internal/core/domain/game an adapter may use, as aliases.
package game

import (
	inner "modorchestrator/internal/core/domain/game"
)

type (
	Capability       = inner.Capability
	Capabilities     = inner.Capabilities
	Definition       = inner.Definition
	DeploymentMethod = inner.DeploymentMethod
	DetectRule       = inner.DetectRule
	Discovery        = inner.Discovery
	FilePattern      = inner.FilePattern
	ID               = inner.ID
	InstanceID       = inner.InstanceID
	Instance         = inner.Instance
	Location         = inner.Location
	Manifest         = inner.Manifest
	ModLayout        = inner.ModLayout
	ModType          = inner.ModType
	ModTypeID        = inner.ModTypeID
	RegistryHint     = inner.RegistryHint
	RootError        = inner.RootError
	RootReason       = inner.RootReason
	StoreRef         = inner.StoreRef
	Support          = inner.Support
	Target           = inner.Target
	TargetID         = inner.TargetID
	TargetSpec       = inner.TargetSpec
)

const (
	CapFilesystemTarget  = inner.CapFilesystemTarget
	CapModTypes          = inner.CapModTypes
	CapInstaller         = inner.CapInstaller
	CapPlugins           = inner.CapPlugins
	CapLoadOrder         = inner.CapLoadOrder
	CapSaveGames         = inner.CapSaveGames
	CapGameSettings      = inner.CapGameSettings
	CapTools             = inner.CapTools
	CapLaunch            = inner.CapLaunch
	CapExternalChanges   = inner.CapExternalChanges
	CapAdapterInstallers = inner.CapAdapterInstallers
	CapHealthChecks      = inner.CapHealthChecks
	CapDefaultCategories = inner.CapDefaultCategories
	CapRunningDetection  = inner.CapRunningDetection
	DefaultModType       = inner.DefaultModType
	LayoutMerge          = inner.LayoutMerge
	LayoutModFolder      = inner.LayoutModFolder
	MethodHardlink       = inner.MethodHardlink
	MethodSymlink        = inner.MethodSymlink
	MethodCopy           = inner.MethodCopy
	RootNotFound         = inner.RootNotFound
	RootNotDirectory     = inner.RootNotDirectory
	RootMarkerMissing    = inner.RootMarkerMissing
	RootUnreadable       = inner.RootUnreadable
	RootNotAbsolute      = inner.RootNotAbsolute
	StoreSteam           = inner.StoreSteam
	StoreGOG             = inner.StoreGOG
	StoreEpic            = inner.StoreEpic
	SupportFull          = inner.SupportFull
	SupportDeclared      = inner.SupportDeclared
	SupportCustom        = inner.SupportCustom
)

var (
	ErrInvalid = inner.ErrInvalid
)

// JoinPath is inner.JoinPath.
func JoinPath(elem ...string) string { return inner.JoinPath(elem...) }

// NewCapabilities is inner.NewCapabilities.
func NewCapabilities(caps ...Capability) Capabilities { return inner.NewCapabilities(caps...) }

// ResolveCustomTargets is inner.ResolveCustomTargets.
func ResolveCustomTargets(root string, specs []TargetSpec) ([]Target, error) {
	return inner.ResolveCustomTargets(root, specs)
}

package sdk

import (
	inner "modorchestrator/internal/core/application/ports"
)

type (
	AdapterCatalog      = inner.AdapterCatalog
	CatalogProvider     = inner.CatalogProvider
	CategoryProvider    = inner.CategoryProvider
	DefaultCategory     = inner.DefaultCategory
	EntryHost           = inner.EntryHost
	FileLocation        = inner.FileLocation
	FileReader          = inner.FileReader
	GameAdapter         = inner.GameAdapter
	GameTemplate        = inner.GameTemplate
	HealthCheckProvider = inner.HealthCheckProvider
	InstallerProvider   = inner.InstallerProvider
	LaunchOption        = inner.LaunchOption
	LaunchSupport       = inner.LaunchSupport
	LoadOrderSupport    = inner.LoadOrderSupport
	ModContent          = inner.ModContent
	PluginArchives      = inner.PluginArchives
	PluginSupport       = inner.PluginSupport
	ProcessDeclarer     = inner.ProcessDeclarer
	RootHints           = inner.RootHints
	TemplateProvider    = inner.TemplateProvider
	DirEntry            = inner.DirEntry
	FileInfo            = inner.FileInfo
	RegistryHint        = inner.RegistryHint
	StoreInstall        = inner.StoreInstall
)

const (
	FolderLocalAppData = inner.FolderLocalAppData
)

var (
	ErrNotFound = inner.ErrNotFound
)

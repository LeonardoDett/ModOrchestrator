package sdk

import (
	inner "modorchestrator/internal/core/application/ports"
)

type (
	AdapterCatalog      = inner.AdapterCatalog
	ArchiveChecker      = inner.ArchiveChecker
	CatalogProvider     = inner.CatalogProvider
	CategoryProvider    = inner.CategoryProvider
	DefaultCategory     = inner.DefaultCategory
	EntryHost           = inner.EntryHost
	FileLocation        = inner.FileLocation
	FileOwners          = inner.FileOwners
	FileReader          = inner.FileReader
	GameAdapter         = inner.GameAdapter
	GameSettingsSupport = inner.GameSettingsSupport
	GameTemplate        = inner.GameTemplate
	HealthCheckProvider = inner.HealthCheckProvider
	InstallerProvider   = inner.InstallerProvider
	LaunchOption        = inner.LaunchOption
	LaunchSupport       = inner.LaunchSupport
	LoadOrderSupport    = inner.LoadOrderSupport
	LootGame            = inner.LootGame
	LootSupport         = inner.LootSupport
	ModContent          = inner.ModContent
	PluginArchives      = inner.PluginArchives
	PluginChecker       = inner.PluginChecker
	PluginFile          = inner.PluginFile
	PluginSupport       = inner.PluginSupport
	ProcessDeclarer     = inner.ProcessDeclarer
	RootHints           = inner.RootHints
	RunLog              = inner.RunLog
	RunLogChecker       = inner.RunLogChecker
	SaveGamesSupport    = inner.SaveGamesSupport
	TemplateProvider    = inner.TemplateProvider
	ToolSupport         = inner.ToolSupport
	DirEntry            = inner.DirEntry
	FileInfo            = inner.FileInfo
	RegistryHint        = inner.RegistryHint
	StoreInstall        = inner.StoreInstall
	TargetFile          = inner.TargetFile
)

const (
	FolderLocalAppData = inner.FolderLocalAppData
	FolderDocuments    = inner.FolderDocuments
)

var (
	ErrNotFound = inner.ErrNotFound
)

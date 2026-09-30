package stores

import (
	"context"
	"slices"
	"testing"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/testutil/memfs"
)

type fakeRegistry struct {
	values map[string]string // "HKLM|key|name"
	subs   map[string][]string
}

func (f fakeRegistry) Value(root, key, name string) (string, bool) {
	v, ok := f.values[root+"|"+key+"|"+name]
	return v, ok
}
func (f fakeRegistry) SubKeys(root, key string) []string { return f.subs[root+"|"+key] }

const libraryFolders = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"apps"
		{
			"228980"		"123"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"apps"
		{
			"489830"		"14000000000"
		}
	}
}
`

const skyrimManifest = `"AppState"
{
	"appid"		"489830"
	"Universe"		"1"
	"name"		"The Elder Scrolls V: Skyrim Special Edition"
	"installdir"		"Skyrim Special Edition"
	// comment
}
`

func TestSteamLibrariesAndManifests(t *testing.T) {
	fs := memfs.New("C:", "D:")
	fs.AddFile(`C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf`, libraryFolders)
	fs.AddFile(`D:\SteamLibrary\steamapps\appmanifest_489830.acf`, skyrimManifest)
	fs.AddFile(`D:\SteamLibrary\steamapps\appmanifest_bad.acf`, `"AppState" {`) // corrupt: skipped
	fs.AddFile(`D:\SteamLibrary\steamapps\readme.txt`, "x")
	reg := fakeRegistry{values: map[string]string{
		"HKCU|Software\\Valve\\Steam|SteamPath": "c:/program files (x86)/steam",
	}}
	s := &Scanner{FS: fs, Reg: reg}
	got, err := s.Scan(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	want := ports.StoreInstall{Store: "steam", AppID: "489830", Path: `D:\SteamLibrary\steamapps\common\Skyrim Special Edition`}
	if !slices.Contains(got, want) {
		t.Fatalf("installs = %+v, want %+v", got, want)
	}
}

func TestOldLibraryFoldersFormat(t *testing.T) {
	old := `"LibraryFolders" { "TimeNextStatsReport" "1" "1" "E:\\Games\\Steam" }`
	if got := steamLibraries(old); !slices.Equal(got, []string{`E:\Games\Steam`}) {
		t.Fatalf("libraries = %v", got)
	}
}

func TestGOGFromRegistry(t *testing.T) {
	base := `SOFTWARE\WOW6432Node\GOG.com\Games`
	reg := fakeRegistry{
		subs: map[string][]string{"HKLM|" + base: {"1711230643", "broken"}},
		values: map[string]string{
			"HKLM|" + base + `\1711230643|path`:   `D:\GOG Games\Skyrim Special Edition`,
			"HKLM|" + base + `\1711230643|gameID`: "1711230643",
		},
	}
	got, _ := (&Scanner{FS: memfs.New("C:"), Reg: reg}).Scan(context.Background(), nil)
	if len(got) != 1 || got[0] != (ports.StoreInstall{Store: "gog", AppID: "1711230643", Path: `D:\GOG Games\Skyrim Special Edition`}) {
		t.Fatalf("installs = %+v", got)
	}
}

func TestEpicManifests(t *testing.T) {
	fs := memfs.New("C:")
	dir := `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests`
	fs.AddFile(dir+`\ABC123.item`, `{"AppName":"ac82db5035584c7f8a2c548d98c86b2c","InstallLocation":"D:/Epic/Skyrim","DisplayName":"Skyrim"}`)
	fs.AddFile(dir+`\BAD.item`, `not json`)
	fs.AddFile(dir+`\note.txt`, `{}`)
	s := &Scanner{FS: fs, Env: func(k string) string {
		if k == "ProgramData" {
			return `C:\ProgramData`
		}
		return ""
	}}
	got, _ := s.Scan(context.Background(), nil)
	if len(got) != 1 || got[0] != (ports.StoreInstall{Store: "epic", AppID: "ac82db5035584c7f8a2c548d98c86b2c", Path: `D:\Epic\Skyrim`}) {
		t.Fatalf("installs = %+v", got)
	}
}

func TestRegistryHintsDeclaredByAdapters(t *testing.T) {
	reg := fakeRegistry{values: map[string]string{
		`HKLM|SOFTWARE\WOW6432Node\Bethesda Softworks\Skyrim Special Edition|installed path`: `C:\Games\Skyrim`,
	}}
	hints := []ports.RegistryHint{
		{ID: "bethesda", Key: `HKLM\SOFTWARE\WOW6432Node\Bethesda Softworks\Skyrim Special Edition`, Value: "installed path"},
		{ID: "absent", Key: `HKLM\SOFTWARE\Nothing`, Value: "x"},
	}
	got, _ := (&Scanner{FS: memfs.New("C:"), Reg: reg}).Scan(context.Background(), hints)
	if len(got) != 1 || got[0] != (ports.StoreInstall{Store: "registry", AppID: "bethesda", Path: `C:\Games\Skyrim`}) {
		t.Fatalf("installs = %+v", got)
	}
}

func TestNothingInstalledIsNotAnError(t *testing.T) {
	got, err := (&Scanner{FS: memfs.New("C:")}).Scan(context.Background(), nil)
	if err != nil || len(got) != 0 {
		t.Fatalf("%v %v", got, err)
	}
}

func TestVDFRejectsMalformedInput(t *testing.T) {
	for _, src := range []string{`"a" {`, `"a"`, `}`, `"a" "unterminated`, `{ "a" "b" }`} {
		if _, err := parseVDF(src); err == nil {
			t.Errorf("%q must fail", src)
		}
	}
}

package tool

import (
	"errors"
	"testing"

	"modorchestrator/internal/core/domain/game"
)

func testContext() Context {
	return Context{
		Instance: game.Instance{
			Root: `C:\Games\G`, Staging: `D:\MO\staging`, ArchiveStore: `D:\MO\archives`,
			Targets: []game.Target{{ID: "data", Path: `C:\Games\G\Data`}, {ID: "root", Path: `C:\Games\G`}},
		},
		Profile: "p1", ProfileName: "Main",
	}
}

func TestExpand(t *testing.T) {
	vars := VariablesOf(testContext())
	cases := []struct{ in, want string }{
		{"", ""},
		{"-o:{target:data}", `-o:C:\Games\G\Data`},
		{`"{game}\Tools" -p {profile} {{x}}`, `"C:\Games\G\Tools" -p Main {x}`},
		{"{GAME}", `C:\Games\G`},
		{"{profile_id}|{staging}|{archives}", `p1|D:\MO\staging|D:\MO\archives`},
	}
	for _, c := range cases {
		got, err := Expand(c.in, vars)
		if err != nil || got != c.want {
			t.Errorf("Expand(%q) = %q, %v; want %q", c.in, got, err, c.want)
		}
	}
	for _, bad := range []string{"{nope}", "{game", "x}", "{target:overrides}"} {
		var e *Error
		if _, err := Expand(bad, vars); !errors.As(err, &e) || !errors.Is(err, ErrInvalid) {
			t.Errorf("Expand(%q) = %v", bad, err)
		}
	}
}

func TestNamesFollowTheInstance(t *testing.T) {
	got := Names(testContext())
	want := []string{"game", "staging", "archives", "profile", "profile_id", "target:data", "target:root"}
	if len(got) != len(want) {
		t.Fatalf("names = %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("names = %v", got)
		}
	}
}

func TestValidate(t *testing.T) {
	vars := VariablesOf(testContext())
	ok := Tool{Name: "Editor", Exe: `{game}\Edit.exe`, Args: "-x {target:data}", Env: []EnvVar{{Name: "A", Value: "{profile}"}}}
	if err := ok.Validate(vars); err != nil {
		t.Fatal(err)
	}
	cases := map[string]Tool{
		ReasonName:      {Exe: "a.exe"},
		ReasonExe:       {Name: "x"},
		ReasonExtension: {Name: "x", Exe: `C:\a.bat`},
		ReasonEnvName:   {Name: "x", Exe: "a.exe", Env: []EnvVar{{Name: "A=B"}}},
		ReasonEnvRepeat: {Name: "x", Exe: "a.exe", Env: []EnvVar{{Name: "a"}, {Name: "A"}}},
		ReasonVariable:  {Name: "x", Exe: "a.exe", WorkDir: "{saves}"},
		ReasonSyntax:    {Name: "x", Exe: "a.exe", Args: "{game"},
	}
	for reason, tl := range cases {
		var e *Error
		if err := tl.Validate(vars); !errors.As(err, &e) || e.Reason != reason {
			t.Errorf("%s: %v", reason, err)
		}
	}
}

func TestNormalizeDropsEmptyRows(t *testing.T) {
	tl := Tool{Name: "  N ", Exe: ` "C:\a.exe" `, Env: []EnvVar{{}, {Name: " K ", Value: "v"}, {Name: " ", Value: " "}}}
	tl.Normalize()
	if tl.Name != "N" || tl.Exe != `C:\a.exe` || len(tl.Env) != 1 || tl.Env[0].Name != "K" {
		t.Fatalf("normalized = %+v", tl)
	}
}

func TestKnown(t *testing.T) {
	k := Known{ID: "ed", Name: "Ed", Executables: []Executable{{File: "Ed.exe"}, {File: "Ed64.exe", Args: "-g"}}, Paths: []string{"", "Tools/Ed"}}
	if !k.Valid() {
		t.Fatal("valid declaration refused")
	}
	if e, ok := k.Match(`C:\x\ED64.EXE`); !ok || e.Args != "-g" {
		t.Fatalf("match = %+v %v", e, ok)
	}
	if _, ok := k.Match(`C:\x\other.exe`); ok {
		t.Fatal("other file matched")
	}
	for _, bad := range []Known{
		{Name: "x", Executables: k.Executables},
		{ID: "x", Name: "x"},
		{ID: "x", Name: "x", Executables: []Executable{{File: "a.bat"}}},
		{ID: "x", Name: "x", Executables: []Executable{{File: `t\a.exe`}}},
		{ID: "x", Name: "x", Executables: k.Executables, Paths: []string{"../up"}},
		{ID: "x", Name: "x", Executables: k.Executables, Paths: []string{`C:/abs`}},
	} {
		if bad.Valid() {
			t.Errorf("invalid accepted: %+v", bad)
		}
	}
}

func TestSort(t *testing.T) {
	list := []Tool{{ID: "c", Name: "b", Position: 1}, {ID: "a", Name: "Z", Position: 0}, {ID: "b", Name: "a", Position: 1}}
	Sort(list)
	if list[0].ID != "a" || list[1].ID != "b" || list[2].ID != "c" {
		t.Fatalf("sorted = %+v", list)
	}
}

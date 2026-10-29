package gameini

import "testing"

func TestLookup(t *testing.T) {
	data := []byte("; comment\r\n[Display]\r\nfGamma=1.0\r\n[general]\r\n  sLocalSavePath = Saves\\A\\ \r\n;SLocalSavePath=no\r\n[Other]\r\nSLocalSavePath=other\r\n")
	v, ok := Lookup(data, "General", "SLocalSavePath")
	if !ok || v != `Saves\A\` {
		t.Fatalf("got %q %v", v, ok)
	}
	if _, ok := Lookup(data, "General", "missing"); ok {
		t.Fatal("missing key found")
	}
	if _, ok := Lookup(data, "Absent", "fGamma"); ok {
		t.Fatal("key of another section found")
	}
}

func TestLookupLastRepeatedKeyWins(t *testing.T) {
	data := []byte("[General]\nk=1\nk=2\n")
	if v, _ := Lookup(data, "general", "K"); v != "2" {
		t.Fatalf("got %q", v)
	}
}

func TestSetReplacesOnlyTheLine(t *testing.T) {
	data := []byte("[General]\r\nsLanguage=ENGLISH\r\nSLocalSavePath=Saves\\\r\n\r\n[Display]\r\nfGamma=1.0")
	got := string(Set(data, "general", "slocalsavepath", `Saves\p1\`))
	want := "[General]\r\nsLanguage=ENGLISH\r\nSLocalSavePath=Saves\\p1\\\r\n\r\n[Display]\r\nfGamma=1.0"
	if got != want {
		t.Fatalf("got %q", got)
	}
}

func TestSetAddsKeyAtEndOfSection(t *testing.T) {
	data := []byte("[General]\nsLanguage=ENGLISH\n\n[Display]\nfGamma=1.0\n")
	got := string(Set(data, "General", "SLocalSavePath", "x"))
	want := "[General]\nsLanguage=ENGLISH\nSLocalSavePath=x\n\n[Display]\nfGamma=1.0\n"
	if got != want {
		t.Fatalf("got %q", got)
	}
	// Section that is the last line, without an ending.
	got = string(Set([]byte("[General]"), "General", "k", "v"))
	if got != "[General]\r\nk=v\r\n" {
		t.Fatalf("got %q", got)
	}
}

func TestSetAddsSection(t *testing.T) {
	if got := string(Set(nil, "General", "k", "v")); got != "[General]\r\nk=v\r\n" {
		t.Fatalf("empty file: %q", got)
	}
	if got := string(Set([]byte("[Display]\nfGamma=1"), "General", "k", "v")); got != "[Display]\nfGamma=1\n[General]\nk=v\n" {
		t.Fatalf("got %q", got)
	}
}

func TestSetKeepsBytesThatAreNotUTF8(t *testing.T) {
	data := []byte("[General]\r\nsName=Caf\xe9\r\nk=1\r\n")
	got := Set(data, "General", "k", "2")
	if string(got) != "[General]\r\nsName=Caf\xe9\r\nk=2\r\n" {
		t.Fatalf("got %q", got)
	}
}

func TestRemove(t *testing.T) {
	data := []byte("[General]\r\nk=1\r\nother=2\r\nK=3\r\n[Display]\r\nk=keep\r\n")
	got := string(Remove(data, "general", "k"))
	if got != "[General]\r\nother=2\r\n[Display]\r\nk=keep\r\n" {
		t.Fatalf("got %q", got)
	}
	if string(Remove(data, "General", "absent")) != string(data) {
		t.Fatal("removing an absent key changed the file")
	}
	// Round trip: set then remove gives back the original.
	orig := []byte("[General]\nsLanguage=ENGLISH\n")
	if string(Remove(Set(orig, "General", "k", "v"), "General", "k")) != string(orig) {
		t.Fatal("set + remove is not the original")
	}
}

func TestPairsListsKeysBySection(t *testing.T) {
	data := []byte("orphan=1\r\n; c\r\n[Display]\r\nfGamma = 1.2\r\n#x=1\r\n[General]\r\nk=a\r\nk=b\r\nnot a pair\r\n")
	got := Pairs(data)
	want := []Pair{{"Display", "fGamma", "1.2"}, {"General", "k", "a"}, {"General", "k", "b"}}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v", got)
		}
	}
}

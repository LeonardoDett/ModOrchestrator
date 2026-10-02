package installer

import (
	"encoding/xml"
	"errors"
	"io"
	"regexp"
	"strings"

	"modorchestrator/internal/core/domain/fomod"
)

// Metadata is what an archive tells about the mod (core/02 §9). The user's
// attributes always take precedence.
type Metadata struct {
	Name        string
	Version     string
	Author      string
	Description string
	Website     string
}

// Merge fills the empty fields of m from o.
func (m Metadata) Merge(o Metadata) Metadata {
	pick := func(a, b string) string {
		if strings.TrimSpace(a) != "" {
			return a
		}
		return b
	}
	return Metadata{
		Name: pick(m.Name, o.Name), Version: pick(m.Version, o.Version), Author: pick(m.Author, o.Author),
		Description: pick(m.Description, o.Description), Website: pick(m.Website, o.Website),
	}
}

var (
	// "<name>-<mod id>-<version>-<unix time>" as Nexus names downloads.
	nexusName = regexp.MustCompile(`^(.+?)-(\d+)-([0-9][0-9A-Za-z-]*?)-(\d{9,11})$`)
	// A trailing version: "Mod v1.2.3", "Mod_1.2", "Mod-2.0a".
	trailingVersion = regexp.MustCompile(`^(.+?)[ _-]+v?(\d+(?:[._]\d+)+[a-z]?)$`)
	archiveExts     = []string{".zip", ".7z", ".rar"}
)

// NameFromArchive derives the mod name and version from the archive file
// name: the extension and a Nexus "-id-version-timestamp" suffix are removed
// (core/02 §9). A folder name goes through the same rules.
func NameFromArchive(file string) Metadata {
	name := strings.TrimSpace(file)
	low := strings.ToLower(name)
	for _, ext := range archiveExts {
		if strings.HasSuffix(low, ext) {
			name = name[:len(name)-len(ext)]
			break
		}
	}
	if m := nexusName.FindStringSubmatch(name); m != nil {
		return Metadata{Name: strings.TrimSpace(m[1]), Version: strings.ReplaceAll(m[3], "-", ".")}
	}
	if m := trailingVersion.FindStringSubmatch(name); m != nil {
		return Metadata{Name: strings.TrimSpace(m[1]), Version: strings.ReplaceAll(m[2], "_", ".")}
	}
	return Metadata{Name: name}
}

// InfoXMLPath returns the path of fomod/info.xml in the archive (up to
// three levels deep), if any.
func InfoXMLPath(entries []Entry) (string, bool) {
	for _, e := range entries {
		segs := strings.Split(e.Path.Key(), "/")
		n := len(segs)
		if !e.Dir && n >= 2 && n <= 5 && segs[n-1] == "info.xml" && segs[n-2] == fomodDir {
			return e.Path.String(), true
		}
	}
	return "", false
}

// MaxInfoXMLSize bounds what is parsed (core/03 §7).
const MaxInfoXMLSize = 8 << 20

// ErrInvalidXML is returned for malformed metadata.
var ErrInvalidXML = errors.New("installer: invalid xml")

// ParseInfoXML reads fomod/info.xml. It accepts UTF-8 and UTF-16 (with BOM)
// and the Windows-1252/ISO-8859-1 declarations common in real archives. The
// XML decoder never resolves external entities.
func ParseInfoXML(data []byte) (Metadata, error) {
	if len(data) > MaxInfoXMLSize {
		return Metadata{}, ErrInvalidXML
	}
	text, err := fomod.DecodeText(data)
	if err != nil {
		return Metadata{}, err
	}
	var doc struct {
		Name        string `xml:"Name"`
		Author      string `xml:"Author"`
		Version     string `xml:"Version"`
		Description string `xml:"Description"`
		Website     string `xml:"Website"`
	}
	dec := xml.NewDecoder(strings.NewReader(text))
	dec.Strict = false
	dec.CharsetReader = func(_ string, r io.Reader) (io.Reader, error) { return r, nil } // already decoded
	if err := dec.Decode(&doc); err != nil {
		return Metadata{}, errors.Join(ErrInvalidXML, err)
	}
	clean := func(s string) string { return strings.TrimSpace(s) }
	return Metadata{
		Name: clean(doc.Name), Author: clean(doc.Author), Version: clean(doc.Version),
		Description: clean(doc.Description), Website: clean(doc.Website),
	}, nil
}

// Command fomodfixtures builds the FOMOD fixtures of internal/core/domain/fomod
// from real archives (core/03 §9). It never extracts mod content: only the
// listing of the archive and the XML files of its fomod folder are written.
//
//	go run ./tools/fomodfixtures scan <folder>            report FOMOD features per archive
//	go run ./tools/fomodfixtures take <archive> <outdir>  write entries.txt and fomod/*.xml
package main

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/bodgit/sevenzip"
	"github.com/nwaples/rardecode/v2"
)

type entry struct {
	path string
	size int64
	dir  bool
}

// walk visits every entry; read returns the content when wanted.
func walk(file string, fn func(e entry, read func() ([]byte, error)) error) error {
	switch strings.ToLower(filepath.Ext(file)) {
	case ".zip":
		r, err := zip.OpenReader(file)
		if err != nil {
			return err
		}
		defer r.Close()
		for _, f := range r.File {
			if err := fn(entry{f.Name, int64(f.UncompressedSize64), f.FileInfo().IsDir()}, func() ([]byte, error) {
				rc, err := f.Open()
				if err != nil {
					return nil, err
				}
				defer rc.Close()
				return io.ReadAll(io.LimitReader(rc, 8<<20))
			}); err != nil {
				return err
			}
		}
	case ".7z":
		r, err := sevenzip.OpenReader(file)
		if err != nil {
			return err
		}
		defer r.Close()
		for _, f := range r.File {
			if err := fn(entry{f.Name, int64(f.UncompressedSize), f.FileInfo().IsDir()}, func() ([]byte, error) {
				rc, err := f.Open()
				if err != nil {
					return nil, err
				}
				defer rc.Close()
				return io.ReadAll(io.LimitReader(rc, 8<<20))
			}); err != nil {
				return err
			}
		}
	case ".rar":
		r, err := rardecode.OpenReader(file)
		if err != nil {
			return err
		}
		defer r.Close()
		for {
			h, err := r.Next()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				return err
			}
			if err := fn(entry{h.Name, h.UnPackedSize, h.IsDir}, func() ([]byte, error) {
				return io.ReadAll(io.LimitReader(r, 8<<20))
			}); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unsupported %s", file)
	}
	return nil
}

func norm(p string) string { return strings.Trim(strings.ReplaceAll(p, `\`, "/"), "/") }

// fomodXML reports whether p is fomod/<name>.xml up to three levels deep.
func fomodXML(p string) (string, bool) {
	segs := strings.Split(strings.ToLower(norm(p)), "/")
	n := len(segs)
	if n >= 2 && n <= 5 && segs[n-2] == "fomod" && strings.HasSuffix(segs[n-1], ".xml") {
		return segs[n-1], true
	}
	return "", false
}

var features = map[string]*regexp.Regexp{
	"exactlyOne":  regexp.MustCompile(`(?i)type="SelectExactlyOne"`),
	"atMostOne":   regexp.MustCompile(`(?i)type="SelectAtMostOne"`),
	"atLeastOne":  regexp.MustCompile(`(?i)type="SelectAtLeastOne"`),
	"all":         regexp.MustCompile(`(?i)type="SelectAll"`),
	"any":         regexp.MustCompile(`(?i)type="SelectAny"`),
	"flags":       regexp.MustCompile(`(?i)<flagDependency`),
	"conditional": regexp.MustCompile(`(?i)<conditionalFileInstalls`),
	"fileDep":     regexp.MustCompile(`(?i)<fileDependency`),
	"visible":     regexp.MustCompile(`(?i)<visible`),
	"dynType":     regexp.MustCompile(`(?i)<dependencyType`),
	"moduleDeps":  regexp.MustCompile(`(?i)<moduleDependencies`),
	"gameDep":     regexp.MustCompile(`(?i)<(gameDependency|foseDependency|fommDependency)`),
	"required":    regexp.MustCompile(`(?i)<requiredInstallFiles`),
}

func scan(dir string) error {
	files, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		file := filepath.Join(dir, f.Name())
		var xml []byte
		script := false
		n := 0
		err := walk(file, func(e entry, read func() ([]byte, error)) error {
			n++
			if name, ok := fomodXML(e.path); ok && name == "moduleconfig.xml" {
				b, err := read()
				if err != nil {
					return err
				}
				xml = b
			}
			if strings.EqualFold(path.Base(norm(e.path)), "script.cs") {
				script = true
			}
			return nil
		})
		if err != nil {
			fmt.Printf("ERR\t%s\t%v\n", f.Name(), err)
			continue
		}
		if xml == nil && !script {
			continue
		}
		text := strings.ToLower(string(bytes.ReplaceAll(xml, []byte{0}, nil)))
		var got []string
		for k, re := range features {
			if re.MatchString(text) {
				got = append(got, k)
			}
		}
		sort.Strings(got)
		if script {
			got = append(got, "SCRIPT")
		}
		fmt.Printf("%d\t%d\t%s\t%s\n", n, len(xml), f.Name(), strings.Join(got, ","))
	}
	return nil
}

func take(file, out string) error {
	var list []string
	err := walk(file, func(e entry, read func() ([]byte, error)) error {
		p := norm(e.path)
		if e.dir {
			list = append(list, p+"/")
		} else {
			list = append(list, fmt.Sprintf("%s\t%d", p, e.size))
		}
		if name, ok := fomodXML(e.path); ok && !e.dir {
			b, err := read()
			if err != nil {
				return err
			}
			dst := filepath.Join(out, "fomod", name)
			if name == "moduleconfig.xml" {
				dst = filepath.Join(out, "fomod", "ModuleConfig.xml")
			} else if name == "info.xml" {
				dst = filepath.Join(out, "fomod", "info.xml")
			}
			if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
				return err
			}
			return os.WriteFile(dst, b, 0o644)
		}
		return nil
	})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		return err
	}
	header := "# source: " + filepath.Base(file) + "\n"
	return os.WriteFile(filepath.Join(out, "entries.txt"), []byte(header+strings.Join(list, "\n")+"\n"), 0o644)
}

func main() {
	var err error
	switch {
	case len(os.Args) == 3 && os.Args[1] == "scan":
		err = scan(os.Args[2])
	case len(os.Args) == 4 && os.Args[1] == "take":
		err = take(os.Args[2], os.Args[3])
	default:
		err = errors.New("usage: fomodfixtures scan <folder> | take <archive> <outdir>")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

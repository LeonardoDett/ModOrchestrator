//go:build !windows

package system

import "errors"

func documentsFolder() (string, error) { return "", errors.New("system: no shell folders") }

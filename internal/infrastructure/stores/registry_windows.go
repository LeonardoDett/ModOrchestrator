//go:build windows

package stores

import "golang.org/x/sys/windows/registry"

// WindowsRegistry reads the 64-bit view of the machine and user hives.
type WindowsRegistry struct{}

func hive(root string) (registry.Key, bool) {
	switch root {
	case "HKLM":
		return registry.LOCAL_MACHINE, true
	case "HKCU":
		return registry.CURRENT_USER, true
	}
	return 0, false
}

func (WindowsRegistry) Value(root, key, name string) (string, bool) {
	h, ok := hive(root)
	if !ok {
		return "", false
	}
	k, err := registry.OpenKey(h, key, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return "", false
	}
	defer k.Close()
	v, _, err := k.GetStringValue(name)
	if err != nil {
		return "", false
	}
	return v, true
}

func (WindowsRegistry) SubKeys(root, key string) []string {
	h, ok := hive(root)
	if !ok {
		return nil
	}
	k, err := registry.OpenKey(h, key, registry.ENUMERATE_SUB_KEYS|registry.WOW64_64KEY)
	if err != nil {
		return nil
	}
	defer k.Close()
	names, err := k.ReadSubKeyNames(-1)
	if err != nil {
		return nil
	}
	return names
}

// NewRegistry returns the system registry reader.
func NewRegistry() Registry { return WindowsRegistry{} }

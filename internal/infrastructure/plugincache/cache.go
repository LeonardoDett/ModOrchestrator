// Package plugincache keeps plugin headers in a JSON file below the cache
// folder (core/14 §1). It is discardable: a missing or corrupt file is an
// empty cache, and "Reconstruir cache de cabeçalhos de plugins" deletes it.
package plugincache

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/plugin"
)

// Cache implements ports.HeaderCache.
type Cache struct {
	path string

	mu      sync.Mutex
	loaded  bool
	entries map[string]plugin.Header
	dirty   bool
}

var _ ports.HeaderCache = (*Cache)(nil)

// New returns a cache stored in dir/plugin-headers.json.
func New(dir string) *Cache {
	return &Cache{path: filepath.Join(dir, "plugin-headers.json"), entries: map[string]plugin.Header{}}
}

func (c *Cache) load() {
	if c.loaded {
		return
	}
	c.loaded = true
	b, err := os.ReadFile(c.path)
	if err != nil {
		return
	}
	var m map[string]plugin.Header
	if json.Unmarshal(b, &m) == nil {
		c.entries = m
	}
}

func (c *Cache) Get(key string) (plugin.Header, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.load()
	h, ok := c.entries[key]
	return h, ok
}

func (c *Cache) Put(key string, h plugin.Header) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.load()
	c.entries[key] = h
	c.dirty = true
}

// Flush writes the file when something changed (temp file + rename).
func (c *Cache) Flush() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.dirty {
		return nil
	}
	b, err := json.Marshal(c.entries)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(c.path), 0o755); err != nil {
		return err
	}
	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, c.path); err != nil {
		return err
	}
	c.dirty = false
	return nil
}

// Clear empties the cache and deletes its file.
func (c *Cache) Clear() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries, c.loaded, c.dirty = map[string]plugin.Header{}, true, false
	if err := os.Remove(c.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

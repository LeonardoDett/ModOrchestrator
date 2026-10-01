package hashing

import (
	"context"
	"strings"
	"testing"
)

func TestSHA256(t *testing.T) {
	got, err := SHA256{}.Hash(context.Background(), strings.NewReader("abc"))
	if err != nil || got != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatalf("hash = %s %v", got, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (SHA256{}).Hash(ctx, strings.NewReader("abc")); err == nil {
		t.Fatal("cancelled context must stop hashing")
	}
}

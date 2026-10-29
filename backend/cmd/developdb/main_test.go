package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBackupGuard(t *testing.T) {
	d := t.TempDir()
	archive := []byte("test archive")
	sum := sha256.Sum256(archive)
	if e := os.WriteFile(filepath.Join(d, "before.dump"), archive, 0600); e != nil {
		t.Fatal(e)
	}
	good := backupManifest{Project: "confirmed", File: "before.dump", Hash: hex.EncodeToString(sum[:]), Restored: true}
	cases := []struct {
		name   string
		change func(*backupManifest)
		bad    bool
	}{
		{"verified", func(*backupManifest) {}, false},
		{"wrong project", func(m *backupManifest) { m.Project = "different" }, true},
		{"unrestored", func(m *backupManifest) { m.Restored = false }, true},
		{"wrong hash", func(m *backupManifest) { m.Hash = "bad" }, true},
		{"path escape", func(m *backupManifest) { m.File = "../before.dump" }, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := good
			tc.change(&m)
			b, _ := json.Marshal(m)
			p := filepath.Join(d, "manifest.json")
			if e := os.WriteFile(p, b, 0600); e != nil {
				t.Fatal(e)
			}
			if e := verifyBackup(p, "confirmed"); (e != nil) != tc.bad {
				t.Fatalf("unexpected guard result: %v", e)
			}
		})
	}
	if e := os.WriteFile(filepath.Join(d, "before.dump"), []byte("tampered"), 0600); e != nil {
		t.Fatal(e)
	}
	b, _ := json.Marshal(good)
	p := filepath.Join(d, "manifest.json")
	_ = os.WriteFile(p, b, 0600)
	if verifyBackup(p, "confirmed") == nil {
		t.Fatal("tampered archive accepted")
	}
}

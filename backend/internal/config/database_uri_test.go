package config

import (
	"strings"
	"testing"
)

func TestProductionDatabaseURIOptions(t *testing.T) {
	const base = "postgresql://reader:fixture-secret@db.example:5432/postgres?sslmode=verify-full"
	for _, tc := range []struct {
		name, suffix string
		bad          bool
	}{
		{"verified TLS", "", false},
		{"custom CA", "&sslrootcert=C%3A%2Fcerts%2Froot.pem", false},
		{"duplicate TLS", "&sslmode=disable", true},
		{"duplicate CA", "&sslrootcert=a&sslrootcert=b", true},
		{"empty CA", "&sslrootcert=", true},
		{"host override", "&host=other.example", true},
		{"port override", "&port=6543", true},
		{"database override", "&dbname=other", true},
		{"user override", "&user=postgres", true},
		{"service override", "&service=other", true},
		{"session options", "&options=-crole%3Dpostgres", true},
		{"invalid escape", "&ignored=%zz", true},
		{"invalid separator", "&ignored=x;y", true},
		{"fragment", "#ignored", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			env := map[string]string{"APP_ENV": "production", "SUPABASE_URL": "https://project.supabase.co", "ALLOWED_ORIGINS": "https://app.example", "DATABASE_URL": base + tc.suffix}
			_, err := Load(func(k string) string { return env[k] })
			if (err != nil) != tc.bad {
				t.Fatalf("unexpected acceptance: error=%v", err)
			}
			if err != nil && strings.Contains(err.Error(), "fixture-secret") {
				t.Fatal("credential leaked")
			}
		})
	}
}

func TestFixtureDatabaseURIOptions(t *testing.T) {
	for key, prefix := range map[string]string{"LIFECYCLE_DATABASE_URL": "m2", "PROFILE_DATABASE_URL": "m4", "COMMUNITY_DATABASE_URL": "m4", "REHEARSAL_DATABASE_URL": "m5"} {
		for _, tc := range []struct {
			name, suffix string
			bad          bool
		}{
			{"local fixture", "", false},
			{"duplicate TLS", "&sslmode=verify-full", true},
			{"invalid escape", "&ignored=%zz", true},
			{"invalid separator", "&ignored=x;y", true},
			{"fragment", "#ignored", true},
			{"host override", "&host=other.example", true},
		} {
			t.Run(key+"/"+tc.name, func(t *testing.T) {
				env := map[string]string{"SUPABASE_URL": "https://project.supabase.co", key: "postgresql://fixture@127.0.0.1/setpiece_" + prefix + "_test_options?sslmode=disable" + tc.suffix}
				_, err := Load(func(k string) string { return env[k] })
				if (err != nil) != tc.bad {
					t.Fatalf("unexpected acceptance: error=%v", err)
				}
			})
		}
	}
}

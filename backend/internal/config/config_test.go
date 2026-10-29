package config

import (
	"strings"
	"testing"
)

func TestLoad(t *testing.T) {
	tests := []struct {
		name      string
		overrides map[string]string
		wantError bool
	}{
		{"development", nil, false},
		{"valid timezone", map[string]string{"PROFILE_TIME_ZONE": "America/Vancouver"}, false},
		{"invalid timezone", map[string]string{"PROFILE_TIME_ZONE": "not/a/timezone"}, true},
		{"bad port", map[string]string{"PORT": "0"}, true},
		{"invalid issuer", map[string]string{"SUPABASE_URL": "https://project.supabase.co/other"}, true},
		{"issuer credentials", map[string]string{"SUPABASE_URL": "https://secret@project.supabase.co"}, true},
		{"issuer query", map[string]string{"SUPABASE_URL": "https://project.supabase.co?key=secret"}, true},
		{"insecure remote issuer", map[string]string{"SUPABASE_URL": "http://remote.example"}, true},
		{"local test issuer", map[string]string{"SUPABASE_URL": "http://127.0.0.1:9999"}, false},
		{"wildcard origin", map[string]string{"ALLOWED_ORIGINS": "*"}, true},
		{"origin path", map[string]string{"ALLOWED_ORIGINS": "https://example.com/path"}, true},
		{"unsupported alg", map[string]string{"SUPABASE_JWT_ALGORITHMS": "HS256"}, true},
		{"pool bounds", map[string]string{"DATABASE_MAX_CONNS": "51"}, true},
		{"bad database URI", map[string]string{"DATABASE_URL": "secret-not-a-uri"}, true},
		{"production missing config", map[string]string{"APP_ENV": "production"}, true},
		{"production no verified TLS", map[string]string{"APP_ENV": "production", "ALLOWED_ORIGINS": "https://app.example", "DATABASE_URL": "postgresql://user:secret@db.example/postgres?sslmode=require"}, true},
		{"production configured", map[string]string{"APP_ENV": "production", "ALLOWED_ORIGINS": "https://app.example", "DATABASE_URL": "postgresql://user:secret@db.example/postgres?sslmode=verify-full"}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			env := map[string]string{"SUPABASE_URL": "https://project.supabase.co"}
			for k, v := range tc.overrides {
				env[k] = v
			}
			cfg, err := Load(func(k string) string { return env[k] })
			if (err != nil) != tc.wantError {
				t.Fatalf("error = %v", err)
			}
			if err != nil && strings.Contains(err.Error(), "secret") {
				t.Fatal("configuration error leaked credentials")
			}
			if err == nil && cfg.RequestTimeout <= cfg.QueryTimeout {
				t.Fatal("request deadline must exceed query deadline")
			}
		})
	}
}

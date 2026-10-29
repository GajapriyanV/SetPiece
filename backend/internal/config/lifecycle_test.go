package config

import (
	"testing"
)

func TestLifecycleIsolation(t *testing.T) {
	for _, uri := range []string{
		"postgresql://user@db.example.com/setpiece_m2_test_a?sslmode=disable",
		"postgresql://user@127.0.0.1/postgres?sslmode=disable",
		"postgresql://user@127.0.0.1/setpiece_m2_test_a?sslmode=disable&host=db.example.com",
	} {
		_, e := Load(func(k string) string {
			if k == "SUPABASE_URL" {
				return "https://project.supabase.co"
			}
			if k == "LIFECYCLE_DATABASE_URL" {
				return uri
			}
			return ""
		})
		if e == nil {
			t.Fatal("accepted unsafe lifecycle target")
		}
	}
	for _, environment := range []string{"development", "production"} {
		_, e := Load(func(k string) string {
			switch k {
			case "APP_ENV":
				return environment
			case "SUPABASE_URL":
				return "https://project.supabase.co"
			case "ALLOWED_ORIGINS":
				return "https://example.com"
			case "DATABASE_URL":
				return "postgresql://user@db.example.com/postgres?sslmode=verify-full"
			case "LIFECYCLE_DATABASE_URL":
				return "postgresql://user@127.0.0.1/setpiece_m2_test_a?sslmode=disable"
			}
			return ""
		})
		if (environment == "development") != (e == nil) {
			t.Fatalf("%s: %v", environment, e)
		}
	}
}

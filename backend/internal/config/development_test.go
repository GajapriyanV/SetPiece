package config

import (
	"net/url"
	"strings"
	"testing"
)

func TestExistingDevelopmentProject(t *testing.T) {
	ref := "abcdefghijklmnopqrst"
	u := &url.URL{Scheme: "postgresql", Host: "aws-1-us-east-1.pooler.supabase.com:5432", Path: "/postgres", User: url.UserPassword("setpiece_app."+ref, "fixture-only"), RawQuery: "sslmode=verify-full"}
	baseline := map[string]string{"APP_ENV": "development", "HOST": "127.0.0.1", "SUPABASE_URL": "https://" + ref + ".supabase.co", "DEVELOPMENT_PROJECT_REF": ref, "DEVELOPMENT_DATABASE_URL": u.String()}
	cases := []struct {
		name string
		env  map[string]string
		bad  bool
	}{
		{"matched session", nil, false},
		{"mixed read pool", map[string]string{"DATABASE_URL": u.String()}, true},
		{"mixed fixture", map[string]string{"REHEARSAL_DATABASE_URL": "postgresql://fixture@127.0.0.1/setpiece_m5_test_x?sslmode=disable"}, true},
		{"production", map[string]string{"APP_ENV": "production"}, true},
		{"public listener", map[string]string{"HOST": "0.0.0.0"}, true},
		{"wrong project", map[string]string{"DEVELOPMENT_PROJECT_REF": "tsrqponmlkjihgfedcba"}, true},
		{"missing project", map[string]string{"DEVELOPMENT_PROJECT_REF": ""}, true},
		{"admin runtime", map[string]string{"DEVELOPMENT_DATABASE_URL": strings.Replace(u.String(), "setpiece_app.", "postgres.", 1)}, true},
		{"transaction pool", map[string]string{"DEVELOPMENT_DATABASE_URL": strings.Replace(u.String(), ":5432", ":6543", 1)}, true},
		{"insecure TLS", map[string]string{"DEVELOPMENT_DATABASE_URL": strings.Replace(u.String(), "verify-full", "require", 1)}, true},
		{"duplicate TLS", map[string]string{"DEVELOPMENT_DATABASE_URL": u.String() + "&sslmode=disable"}, true},
		{"host override", map[string]string{"DEVELOPMENT_DATABASE_URL": u.String() + "&host=evil.invalid"}, true},
		{"admin role option", map[string]string{"DEVELOPMENT_DATABASE_URL": u.String() + "&options=-crole%3Dpostgres"}, true},
		{"small pool", map[string]string{"DATABASE_MAX_CONNS": "1"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := map[string]string{}
			for k, v := range baseline {
				env[k] = v
			}
			for k, v := range tc.env {
				env[k] = v
			}
			c, e := Load(func(k string) string { return env[k] })
			if (e != nil) != tc.bad {
				t.Fatalf("unexpected config result: %v", e)
			}
			if e == nil && (c.ProfileDatabaseURL != u.String() || c.LifecycleDatabaseURL != u.String() || c.CommunityDatabaseURL != u.String()) {
				t.Fatal("modules did not share project")
			}
			if e != nil && strings.Contains(e.Error(), "fixture-only") {
				t.Fatal("credential leak")
			}
		})
	}
	direct := *u
	direct.Host = "db." + ref + ".supabase.co:5432"
	direct.User = url.UserPassword("setpiece_app", "fixture-only")
	if e := ValidateDevelopmentDatabaseURI(direct.String(), baseline["SUPABASE_URL"], ref, "setpiece_app"); e != nil {
		t.Fatal(e)
	}
	if ValidateRehearsalDatabaseURI(u.String()) == nil {
		t.Fatal("remote fixture permitted")
	}
}

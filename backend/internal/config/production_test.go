package config

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestProductionApplication(t *testing.T) {
	ref := "abcdefghijklmnopqrst"
	u := &url.URL{Scheme: "postgresql", Host: "aws-1-us-east-1.pooler.supabase.com:5432", Path: "/postgres", User: url.UserPassword("setpiece_app."+ref, "fixture-password"), RawQuery: "sslmode=verify-full"}
	base := map[string]string{"APP_ENV": "production", "HOST": "0.0.0.0", "SUPABASE_URL": "https://" + ref + ".supabase.co", "PRODUCTION_PROJECT_REF": ref, "PRODUCTION_DATABASE_URL": u.String(), "ALLOWED_ORIGINS": "https://app.example", "LIVEKIT_URL": "wss://fixture.livekit.cloud", "LIVEKIT_API_KEY": "fixture-key", "LIVEKIT_API_SECRET": "fixture-value"}
	pub, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	cert := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "Fixture CA"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, pub, private)
	if err != nil {
		t.Fatal(err)
	}
	ca := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	for _, tc := range []struct {
		name   string
		change map[string]string
		bad    bool
	}{
		{"production", nil, false}, {"custom CA", map[string]string{"DATABASE_CA_PEM": ca}, false},
		{"development", map[string]string{"APP_ENV": "development"}, true},
		{"missing ref", map[string]string{"PRODUCTION_PROJECT_REF": ""}, true},
		{"wrong project", map[string]string{"SUPABASE_URL": "https://tsrqponmlkjihgfedcba.supabase.co"}, true},
		{"mixed read pool", map[string]string{"DATABASE_URL": u.String()}, true},
		{"small pool", map[string]string{"DATABASE_MAX_CONNS": "1"}, true},
		{"admin role", map[string]string{"PRODUCTION_DATABASE_URL": strings.Replace(u.String(), "setpiece_app.", "postgres.", 1)}, true},
		{"transaction pool", map[string]string{"PRODUCTION_DATABASE_URL": strings.Replace(u.String(), ":5432", ":6543", 1)}, true},
		{"unverified TLS", map[string]string{"PRODUCTION_DATABASE_URL": strings.Replace(u.String(), "verify-full", "require", 1)}, true},
		{"host override", map[string]string{"PRODUCTION_DATABASE_URL": u.String() + "&host=evil.invalid"}, true},
		{"local fixture", map[string]string{"REHEARSAL_DATABASE_URL": "postgresql://fixture@127.0.0.1/setpiece_m5_test_x?sslmode=disable"}, true},
		{"development project mixed", map[string]string{"DEVELOPMENT_PROJECT_REF": ref}, true},
		{"missing media", map[string]string{"LIVEKIT_URL": ""}, true},
		{"insecure media", map[string]string{"LIVEKIT_URL": "ws://fixture.livekit.cloud"}, true},
		{"loopback media", map[string]string{"LIVEKIT_URL": "wss://127.0.0.1"}, true},
		{"localhost media", map[string]string{"LIVEKIT_URL": "wss://localhost"}, true},
		{"media credentials in URL", map[string]string{"LIVEKIT_URL": "wss://key:password@fixture.livekit.cloud"}, true},
		{"media path", map[string]string{"LIVEKIT_URL": "wss://fixture.livekit.cloud/path"}, true},
		{"media query", map[string]string{"LIVEKIT_URL": "wss://fixture.livekit.cloud?token=x"}, true},
		{"missing media key", map[string]string{"LIVEKIT_API_KEY": ""}, true},
		{"missing media secret", map[string]string{"LIVEKIT_API_SECRET": ""}, true},
		{"invalid CA", map[string]string{"DATABASE_CA_PEM": "not a certificate"}, true},
		{"ambiguous CA", map[string]string{"DATABASE_CA_PEM": ca, "PRODUCTION_DATABASE_URL": u.String() + "&sslrootcert=ca.pem"}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			env := map[string]string{}
			for k, v := range base {
				env[k] = v
			}
			for k, v := range tc.change {
				env[k] = v
			}
			c, e := Load(func(k string) string { return env[k] })
			if (e != nil) != tc.bad {
				t.Fatalf("unexpected configuration result: %v", e)
			}
			if e != nil && strings.Contains(e.Error(), "fixture-password") {
				t.Fatal("credential leak")
			}
			if e == nil {
				if c.ProfileDatabaseURL != u.String() || c.CommunityDatabaseURL != u.String() || c.LifecycleDatabaseURL != u.String() {
					t.Fatal("split production pool")
				}
				if c.LiveKitURL != base["LIVEKIT_URL"] {
					t.Fatal("incorrect media endpoint")
				}
				if tc.name == "custom CA" && c.DatabaseRootCAs == nil {
					t.Fatal("missing custom trust roots")
				}
			}
		})
	}
}

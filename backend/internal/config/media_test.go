package config

import "testing"

func TestLocalMediaGuard(t *testing.T) {
	for _, tc := range []struct {
		name, url, env, db, key string
		fail                    bool
	}{
		{"valid", "ws://127.0.0.1:7880", "development", "postgresql://test@127.0.0.1/setpiece_m2_test_media?sslmode=disable", "devkey", false},
		{"remote", "wss://cloud.livekit.io", "development", "postgresql://test@127.0.0.1/setpiece_m2_test_media?sslmode=disable", "devkey", true},
		{"production", "ws://127.0.0.1:7880", "production", "", "devkey", true},
		{"no lifecycle", "ws://127.0.0.1:7880", "development", "", "devkey", true},
		{"partial", "ws://127.0.0.1:7880", "development", "postgresql://test@127.0.0.1/setpiece_m2_test_media?sslmode=disable", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			env := map[string]string{"SUPABASE_URL": "https://project.supabase.co", "APP_ENV": tc.env, "LIFECYCLE_DATABASE_URL": tc.db, "LOCAL_LIVEKIT_URL": tc.url, "LOCAL_LIVEKIT_API_KEY": tc.key, "LOCAL_LIVEKIT_API_SECRET": "secret"}
			_, e := Load(func(k string) string { return env[k] })
			if (e != nil) != tc.fail {
				t.Fatalf("configuration error: %v", e)
			}
		})
	}
}

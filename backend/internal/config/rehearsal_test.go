package config

import "testing"

func TestRehearsalGuard(t *testing.T) {
	base := map[string]string{"SUPABASE_URL": "http://127.0.0.1:9999", "REHEARSAL_DATABASE_URL": "postgresql://test@127.0.0.1/setpiece_m5_test_example?sslmode=disable"}
	good, e := Load(func(k string) string { return base[k] })
	if e != nil {
		t.Fatal(e)
	}
	if good.LifecycleDatabaseURL != good.ProfileDatabaseURL || good.CommunityDatabaseURL != good.RehearsalDatabaseURL {
		t.Fatal("split rehearsal store")
	}
	for _, change := range []map[string]string{
		{"APP_ENV": "production"}, {"DATABASE_URL": "postgresql://test@db.example/postgres?sslmode=verify-full"}, {"DATABASE_MAX_CONNS": "1"},
		{"PROFILE_DATABASE_URL": "postgresql://test@127.0.0.1/setpiece_m4_test_x?sslmode=disable"},
		{"LIFECYCLE_DATABASE_URL": "postgresql://test@127.0.0.1/setpiece_m2_test_x?sslmode=disable"},
		{"REHEARSAL_DATABASE_URL": "postgresql://test@remote.example/setpiece_m5_test_x?sslmode=disable"},
		{"REHEARSAL_DATABASE_URL": "postgresql://test@127.0.0.1/postgres?sslmode=disable"},
		{"REHEARSAL_DATABASE_URL": "postgresql://test@127.0.0.1/setpiece_m5_test_x?sslmode=disable&sslmode=verify-full"},
		{"REHEARSAL_DATABASE_URL": "postgresql://test@127.0.0.1/setpiece_m5_test_x?sslmode=disable&host=remote.example"},
	} {
		_, e := Load(func(k string) string {
			if v, ok := change[k]; ok {
				return v
			}
			return base[k]
		})
		if e == nil {
			t.Fatal("unsafe rehearsal configuration accepted")
		}
	}
}

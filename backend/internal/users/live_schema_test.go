package users

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/database"
)

// Explicitly opt-in. PREPARE checks syntax/schema without selecting user rows,
// creating fixtures or executing a migration on the application database.
func TestLiveSchemaQueriesPrepare(t *testing.T) {
	uri := os.Getenv("SETPIECE_SCHEMA_DATABASE_URL")
	if uri == "" {
		t.Skip("SETPIECE_SCHEMA_DATABASE_URL not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := database.Open(ctx, uri, 1, 3*time.Second)
	if err != nil {
		t.Fatal("could not configure schema verification connection")
	}
	defer pool.Close()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal("schema verification database unavailable")
	}
	defer conn.Release()
	for name, query := range map[string]string{"profile": profileQuery, "history": historyQuery} {
		if _, err := conn.Conn().Prepare(ctx, "verify_"+name, query); err != nil {
			t.Fatalf("%s schema preparation failed", name)
		}
	}
}

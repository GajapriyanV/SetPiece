package config

import (
	"crypto/x509"
	"errors"
	"net"
	"net/url"
	"strings"
)

// Production is explicit, shares one restricted PostgreSQL pool, and retains
// certificate/hostname verification and the runtime's ownership fence.
func (c *Config) loadProduction(getenv func(string) string) error {
	c.ProductionDatabaseURL = strings.TrimSpace(getenv("PRODUCTION_DATABASE_URL"))
	c.ProductionProjectRef = strings.TrimSpace(getenv("PRODUCTION_PROJECT_REF"))
	remoteURL := strings.TrimSpace(getenv("LIVEKIT_URL"))
	key, secret := getenv("LIVEKIT_API_KEY"), getenv("LIVEKIT_API_SECRET")
	ca := getenv("DATABASE_CA_PEM")
	if c.ProductionDatabaseURL == "" && c.ProductionProjectRef == "" {
		if ca != "" || remoteURL != "" || key != "" || secret != "" {
			return errors.New("hosted database CA and LiveKit settings require explicit production database mode")
		}
		return nil
	}
	if c.Environment != "production" || c.DatabaseURL != "" || c.ProfileDatabaseURL != "" || c.CommunityDatabaseURL != "" || c.LifecycleDatabaseURL != "" || c.RehearsalDatabaseURL != "" || c.DevelopmentDatabaseURL != "" || c.DevelopmentProjectRef != "" || c.LiveKitURL != "" || c.LiveKitKey != "" || c.LiveKitSecret != "" || c.DatabaseMaxConns < 2 {
		return errors.New("production application mode requires one shared pool of at least two connections and all other database/local media settings unset")
	}
	if ValidateDevelopmentDatabaseURI(c.ProductionDatabaseURL, c.SupabaseURL, c.ProductionProjectRef, "setpiece_app") != nil {
		return errors.New("production database must match the explicit Supabase project and restricted role on port 5432 with verified TLS")
	}
	u, err := url.Parse(remoteURL)
	if err != nil || u.Scheme != "wss" || u.Hostname() == "" || u.Hostname() == "localhost" || net.ParseIP(u.Hostname()) != nil || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" || u.ForceQuery || (u.Port() != "" && u.Port() != "443") || strings.TrimSpace(key) == "" || strings.TrimSpace(secret) == "" {
		return errors.New("production LiveKit requires a public wss origin and server-only API credentials")
	}
	if ca != "" {
		db, _ := url.Parse(c.ProductionDatabaseURL)
		if db.Query().Get("sslrootcert") != "" {
			return errors.New("use DATABASE_CA_PEM or sslrootcert, not both")
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(ca)) {
			return errors.New("DATABASE_CA_PEM must contain a trusted PEM certificate")
		}
		c.DatabaseRootCAs = pool
	}
	c.ProfileDatabaseURL, c.CommunityDatabaseURL, c.LifecycleDatabaseURL = c.ProductionDatabaseURL, c.ProductionDatabaseURL, c.ProductionDatabaseURL
	c.LiveKitURL, c.LiveKitKey, c.LiveKitSecret = strings.TrimRight(remoteURL, "/"), key, secret
	return nil
}

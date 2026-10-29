package config

import (
	"net/url"
	"strings"
)

// ParseQuery reports malformed options; URL.Query silently discards them.
// A single allowlisted value avoids driver-specific overrides of the reviewed
// target, identity and TLS settings. Credentials belong in the URI authority.
func verifiedDatabaseOptions(u *url.URL) bool {
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil || len(q["sslmode"]) != 1 || q.Get("sslmode") != "verify-full" {
		return false
	}
	for key, values := range q {
		if (key != "sslmode" && key != "sslrootcert") || len(values) != 1 || values[0] == "" {
			return false
		}
	}
	return true
}

func fixtureDatabaseURI(uri, prefix string) bool {
	u, err := url.Parse(uri)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Hostname() != "127.0.0.1" || u.Fragment != "" || !strings.HasPrefix(strings.TrimPrefix(u.Path, "/"), prefix) {
		return false
	}
	q, err := url.ParseQuery(u.RawQuery)
	return err == nil && len(q) == 1 && len(q["sslmode"]) == 1 && q.Get("sslmode") == "disable"
}

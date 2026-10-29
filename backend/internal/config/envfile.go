package config

import (
	"errors"
	"os"

	"github.com/joho/godotenv"
)

// LoadEnvFile reads an explicitly chosen local file without overriding process
// environment. Production deployments should inject environment variables.
func LoadEnvFile(path string) error {
	if path == "" {
		return nil
	}
	if err := godotenv.Load(path); err != nil {
		if errors.Is(err, os.ErrNotExist) && path == ".env" {
			return nil
		}
		return errors.New("could not read environment file")
	}
	return nil
}

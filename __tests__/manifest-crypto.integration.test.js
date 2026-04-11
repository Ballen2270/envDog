const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let tmpDir;
let origDir;

beforeAll(() => {
  origDir = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envdog-manifest-test-'));
  process.chdir(tmpDir);
});

afterAll(() => {
  process.chdir(origDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const envdogDir = path.join(tmpDir, '.envdog');
  if (fs.existsSync(envdogDir)) {
    fs.rmSync(envdogDir, { recursive: true, force: true });
  }
  jest.resetModules();
});

afterEach(() => {
  jest.resetModules();
});

describe('manifest.service + crypto.service integration', () => {
  function loadServices() {
    const manifestService = require('../src/services/manifest.service');
    const cryptoService = require('../src/services/crypto.service');
    return { manifestService, cryptoService };
  }

  describe('saveManifest / loadManifest encryption round-trip', () => {
    it('should encrypt originalValue on save and decrypt on load', () => {
      const { manifestService, cryptoService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'application.yml',
            keyPath: 'spring.datasource.password',
            varName: 'DATASOURCE_PASSWORD',
            placeholderPattern: '${DATASOURCE_PASSWORD}',
            originalValue: 'my-secret-db-password',
            profile: 'default'
          }
        ]
      };

      manifestService.saveManifest(manifest);

      const rawContent = fs.readFileSync(
        path.join(tmpDir, '.envdog/manifest.json'),
        'utf-8'
      );
      const rawJson = JSON.parse(rawContent);

      expect(rawJson.mappings[0].originalValue).toMatch(/^envdog:v1:/);
      expect(rawJson.mappings[0].originalValue).not.toBe('my-secret-db-password');

      const loaded = manifestService.loadManifest();
      expect(loaded.mappings[0].originalValue).toBe('my-secret-db-password');
    });

    it('should handle multiple mappings with different values', () => {
      const { manifestService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'application.yml',
            keyPath: 'spring.datasource.url',
            varName: 'DATASOURCE_URL',
            placeholderPattern: '${DATASOURCE_URL}',
            originalValue: 'mysql://admin:p@ss@localhost:3306/mydb',
            profile: 'default'
          },
          {
            file: 'application-dev.yml',
            keyPath: 'spring.datasource.password',
            varName: 'DEV_DATASOURCE_PASSWORD',
            placeholderPattern: '${DEV_DATASOURCE_PASSWORD}',
            originalValue: 'dev-password-123!',
            profile: 'dev'
          },
          {
            file: 'application-prod.yml',
            keyPath: 'app.secret-key',
            varName: 'APP_SECRET_KEY',
            placeholderPattern: '${APP_SECRET_KEY}',
            originalValue: 'sk-prod-xxxxxxxxxxxx',
            profile: 'prod'
          }
        ]
      };

      manifestService.saveManifest(manifest);

      const rawContent = fs.readFileSync(
        path.join(tmpDir, '.envdog/manifest.json'),
        'utf-8'
      );
      const rawJson = JSON.parse(rawContent);

      rawJson.mappings.forEach(m => {
        expect(m.originalValue).toMatch(/^envdog:v1:/);
      });

      const loaded = manifestService.loadManifest();
      expect(loaded.mappings[0].originalValue).toBe('mysql://admin:p@ss@localhost:3306/mydb');
      expect(loaded.mappings[1].originalValue).toBe('dev-password-123!');
      expect(loaded.mappings[2].originalValue).toBe('sk-prod-xxxxxxxxxxxx');
    });

    it('should produce different encrypted values for same plaintext (random IV)', () => {
      const { manifestService } = loadServices();

      const manifest1 = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'app.yml',
            keyPath: 'secret',
            varName: 'SECRET',
            placeholderPattern: '${SECRET}',
            originalValue: 'same-secret',
            profile: 'default'
          }
        ]
      };

      manifestService.saveManifest(manifest1);

      const raw1 = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.envdog/manifest.json'), 'utf-8')
      );
      const encrypted1 = raw1.mappings[0].originalValue;

      manifestService.saveManifest(manifest1);

      const raw2 = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.envdog/manifest.json'), 'utf-8')
      );
      const encrypted2 = raw2.mappings[0].originalValue;

      expect(encrypted1).not.toBe(encrypted2);

      const loaded = manifestService.loadManifest();
      expect(loaded.mappings[0].originalValue).toBe('same-secret');
    });
  });

  describe('loadManifest', () => {
    it('should return null when no manifest file exists', () => {
      const { manifestService } = loadServices();
      expect(manifestService.loadManifest()).toBe(null);
    });

    it('should handle manifest with empty mappings', () => {
      const { manifestService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: []
      };

      manifestService.saveManifest(manifest);
      const loaded = manifestService.loadManifest();

      expect(loaded).not.toBe(null);
      expect(loaded.mappings).toEqual([]);
    });

    it('should handle manifest with null originalValue', () => {
      const { manifestService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'app.yml',
            keyPath: 'some.key',
            varName: 'SOME_KEY',
            placeholderPattern: '${SOME_KEY}',
            originalValue: null,
            profile: 'default'
          }
        ]
      };

      manifestService.saveManifest(manifest);

      const loaded = manifestService.loadManifest();
      expect(loaded.mappings[0].originalValue).toBe(null);
    });

    it('should handle corrupt manifest gracefully', () => {
      const { manifestService } = loadServices();

      const dir = path.join(tmpDir, '.envdog');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        'not valid json{{{',
        'utf-8'
      );

      const loaded = manifestService.loadManifest();
      expect(loaded).toBe(null);
    });
  });

  describe('updateStatus', () => {
    it('should update manifest status and preserve encrypted values', () => {
      const { manifestService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'application.yml',
            keyPath: 'db.password',
            varName: 'DB_PASSWORD',
            placeholderPattern: '${DB_PASSWORD}',
            originalValue: 'super-secret',
            profile: 'default'
          }
        ]
      };

      manifestService.saveManifest(manifest);
      manifestService.updateStatus('restored');

      const loaded = manifestService.loadManifest();
      expect(loaded.status).toBe('restored');
      expect(loaded.mappings[0].originalValue).toBe('super-secret');
    });
  });

  describe('getMappingsByEnv', () => {
    it('should filter mappings by profile', () => {
      const { manifestService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'application.yml',
            keyPath: 'db.password',
            varName: 'DB_PASSWORD',
            placeholderPattern: '${DB_PASSWORD}',
            originalValue: 'default-pw',
            profile: 'default'
          },
          {
            file: 'application-dev.yml',
            keyPath: 'db.password',
            varName: 'DEV_DB_PASSWORD',
            placeholderPattern: '${DEV_DB_PASSWORD}',
            originalValue: 'dev-pw',
            profile: 'dev'
          },
          {
            file: 'application-prod.yml',
            keyPath: 'db.password',
            varName: 'PROD_DB_PASSWORD',
            placeholderPattern: '${PROD_DB_PASSWORD}',
            originalValue: 'prod-pw',
            profile: 'prod'
          }
        ]
      };

      manifestService.saveManifest(manifest);

      const devMappings = manifestService.getMappingsByEnv('dev');
      expect(devMappings).toHaveLength(1);
      expect(devMappings[0].originalValue).toBe('dev-pw');
      expect(devMappings[0].profile).toBe('dev');

      const allMappings = manifestService.getMappingsByEnv(null);
      expect(allMappings).toHaveLength(3);
    });
  });

  describe('getMappingsByFile', () => {
    it('should filter mappings by file name', () => {
      const { manifestService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'application.yml',
            keyPath: 'db.password',
            varName: 'DB_PASSWORD',
            placeholderPattern: '${DB_PASSWORD}',
            originalValue: 'default-pw',
            profile: 'default'
          },
          {
            file: 'application-dev.yml',
            keyPath: 'db.password',
            varName: 'DEV_DB_PASSWORD',
            placeholderPattern: '${DEV_DB_PASSWORD}',
            originalValue: 'dev-pw',
            profile: 'dev'
          }
        ]
      };

      manifestService.saveManifest(manifest);

      const result = manifestService.getMappingsByFile('application.yml');
      expect(result).toHaveLength(1);
      expect(result[0].originalValue).toBe('default-pw');
    });
  });

  describe('getMappingsByEnvAndFile', () => {
    it('should filter by both env and file', () => {
      const { manifestService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'application.yml',
            keyPath: 'db.password',
            varName: 'DB_PASSWORD',
            placeholderPattern: '${DB_PASSWORD}',
            originalValue: 'default-pw',
            profile: 'default'
          },
          {
            file: 'application-dev.yml',
            keyPath: 'db.password',
            varName: 'DEV_DB_PASSWORD',
            placeholderPattern: '${DEV_DB_PASSWORD}',
            originalValue: 'dev-pw',
            profile: 'dev'
          },
          {
            file: 'application-dev.yml',
            keyPath: 'app.key',
            varName: 'APP_KEY',
            placeholderPattern: '${APP_KEY}',
            originalValue: 'dev-key',
            profile: 'dev'
          }
        ]
      };

      manifestService.saveManifest(manifest);

      const result = manifestService.getMappingsByEnvAndFile('dev', 'application-dev.yml');
      expect(result).toHaveLength(2);
      expect(result.map(m => m.originalValue)).toEqual(
        expect.arrayContaining(['dev-pw', 'dev-key'])
      );
    });
  });

  describe('extractProfileFromFileName', () => {
    it('should extract profile from standard spring file names', () => {
      const { manifestService } = loadServices();

      expect(manifestService.extractProfileFromFileName('application-dev.yml')).toBe('dev');
      expect(manifestService.extractProfileFromFileName('application-prod.yaml')).toBe('prod');
      expect(manifestService.extractProfileFromFileName('application-test.yml')).toBe('test');
    });

    it('should return null for default application file', () => {
      const { manifestService } = loadServices();

      expect(manifestService.extractProfileFromFileName('application.yml')).toBe(null);
      expect(manifestService.extractProfileFromFileName('application.yaml')).toBe(null);
    });

    it('should return null for non-spring file names', () => {
      const { manifestService } = loadServices();

      expect(manifestService.extractProfileFromFileName('config.properties')).toBe(null);
      expect(manifestService.extractProfileFromFileName('database.yml')).toBe(null);
    });
  });

  describe('save/load with special characters in values', () => {
    const specialValues = [
      ['connection string with @', 'mysql://admin:p@ssw0rd@host:3306/db'],
      ['value with colons', 'key:val:more'],
      ['value with equals', 'user=admin&pass=secret'],
      ['value with quotes', '"quoted" and \'single\''],
      ['value with backslashes', 'C:\\Users\\admin\\path'],
      ['value with newlines', 'line1\nline2'],
      ['unicode value', '密码=秘密'],
      ['JSON object', '{"nested":{"deep":"value"}}'],
      ['empty value', ''],
    ];

    test.each(specialValues)('should preserve %s through save/load cycle', (_label, value) => {
      jest.resetModules();
      const { manifestService } = loadServices();

      const manifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        status: 'protected',
        mappings: [
          {
            file: 'app.yml',
            keyPath: 'test.key',
            varName: 'TEST_KEY',
            placeholderPattern: '${TEST_KEY}',
            originalValue: value,
            profile: 'default'
          }
        ]
      };

      manifestService.saveManifest(manifest);
      const loaded = manifestService.loadManifest();

      expect(loaded.mappings[0].originalValue).toBe(value);
    });
  });
});

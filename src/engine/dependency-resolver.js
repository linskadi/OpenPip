const fs = require('fs');
const path = require('path');

class DependencyResolver {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.openpipDir = path.join(projectRoot, '.openpip');
  }

  // Check if all dependencies declared in a pipeline are satisfied
  check(pipeline) {
    const missing = [];
    for (const [type, deps] of Object.entries(pipeline.dependencies || {})) {
      for (const dep of deps) {
        if (!this.exists(type, dep)) {
          missing.push({ type, name: dep });
        }
      }
    }
    return { satisfied: missing.length === 0, missing };
  }

  // Check if a specific dependency exists
  exists(type, name) {
    switch (type) {
      case 'templates': return fs.existsSync(path.join(this.openpipDir, 'templates', name));
      case 'knowledge': return fs.existsSync(path.join(this.openpipDir, 'knowledge', name));
      case 'pipelines': return fs.existsSync(path.join(this.openpipDir, 'pipelines', name + '.yaml'));
      case 'roles': return fs.existsSync(path.join(this.openpipDir, 'role-prompts', name + '.md'));
      case 'venues': return fs.existsSync(path.join(this.openpipDir, 'venues', name + '.yaml'));
      default: return false;
    }
  }
}

module.exports = { DependencyResolver };

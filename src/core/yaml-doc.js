const YAML = require('yaml');

function parseYamlDocument(content) {
  return YAML.parseDocument(content, { keepSourceTokens: true });
}

function splitKeyPath(keyPath) {
  return keyPath.split('.').map(s => (/^\d+$/.test(s) ? Number(s) : s));
}

function getNodeRefByPath(doc, keyPath) {
  const segments = splitKeyPath(keyPath);
  let node = doc.contents;
  let parent = null;
  let key = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (YAML.isMap(node)) {
      // 兼容扁平点号键：如 spring.datasource.url: xxx
      const remainingPath = segments.slice(i).map(String).join('.');
      const remainingNode = node.get(remainingPath, true);
      if (remainingNode !== undefined && remainingNode !== null) {
        parent = node;
        key = remainingPath;
        node = remainingNode;
        break;
      }

      parent = node;
      key = seg;
      node = node.get(seg, true);
    } else if (YAML.isSeq(node)) {
      if (typeof seg !== 'number') return null;
      parent = node;
      key = seg;
      node = node.items[seg];
    } else {
      return null;
    }

    if (node === undefined || node === null) {
      return null;
    }
  }

  return { parent, key, node };
}

function getScalarSnapshot(doc, keyPath) {
  const ref = getNodeRefByPath(doc, keyPath);
  if (!ref || !YAML.isScalar(ref.node)) return null;

  return {
    value: String(ref.node.value ?? ''),
    style: ref.node.type || 'PLAIN'
  };
}

function setScalarValue(doc, keyPath, value, style) {
  const ref = getNodeRefByPath(doc, keyPath);
  if (!ref || !YAML.isScalar(ref.node)) return false;

  ref.node.value = String(value);
  if (style) {
    ref.node.type = style;
  }
  return true;
}

function stringifyDocument(doc) {
  return String(doc);
}

module.exports = {
  parseYamlDocument,
  getScalarSnapshot,
  setScalarValue,
  stringifyDocument
};

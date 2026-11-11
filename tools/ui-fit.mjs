import assert from 'node:assert/strict'

// A page can fit the viewport while a button or selector silently clips its label.
export async function assertFullText(root, label) {
  const clipped = await root.evaluate(element => Array.from(element.querySelectorAll('button, taro-button-core, .picker, .store-value, .option-select-label')).flatMap(node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
    if (!rect.width || !rect.height || style.display === 'inline' || style.visibility === 'hidden') return []
    return node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2
      ? [{ className: node.className, text: node.textContent.trim(), box: [node.clientWidth, node.clientHeight], content: [node.scrollWidth, node.scrollHeight] }]
      : []
  }))
  assert.deepEqual(clipped, [], `${label}: all button and option labels are readable`)
}

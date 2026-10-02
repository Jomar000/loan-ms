const isLocalSource = (source) =>
    source.startsWith('$') ||
    source.startsWith('./') ||
    source.startsWith('../')

const compareImports = (left, right) => {
    const leftGroup = isLocalSource(left) ? 1 : 0
    const rightGroup = isLocalSource(right) ? 1 : 0

    if (leftGroup !== rightGroup) {
        return leftGroup - rightGroup
    }

    const leftKey = left.toLocaleLowerCase('en')
    const rightKey = right.toLocaleLowerCase('en')

    if (leftKey < rightKey) return -1
    if (leftKey > rightKey) return 1
    return 0
}

export default {
    meta: {
        type: 'layout',
        docs: {
            description:
                'Require package imports before local imports and alphabetize each group',
        },
        messages: {
            order: 'Move "{{current}}" before "{{previous}}". Package imports come first; imports are alphabetical within each group.',
        },
        schema: [],
    },
    create(context) {
        const previousImportByParent = new WeakMap()

        return {
            ImportDeclaration(current) {
                const parent = current.parent
                if (!parent) return

                const previous = previousImportByParent.get(parent)
                previousImportByParent.set(parent, current)

                if (!previous) return

                const previousSource = previous.source.value
                const currentSource = current.source.value

                if (
                    typeof previousSource === 'string' &&
                    typeof currentSource === 'string' &&
                    compareImports(previousSource, currentSource) > 0
                ) {
                    context.report({
                        node: current,
                        messageId: 'order',
                        data: {
                            current: currentSource,
                            previous: previousSource,
                        },
                    })
                }
            },
        }
    },
}

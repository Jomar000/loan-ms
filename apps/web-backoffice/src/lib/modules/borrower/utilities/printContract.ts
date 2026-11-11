import contractPrintStylesUrl from '../assets/contractPrint.css?url'

/** Prints a local document copy without the backoffice navigation or controls. */
export async function printContract(source: HTMLElement, title: string) {
    const frame = document.createElement('iframe')
    frame.title = title
    frame.className = 'fixed size-0 border-0'
    frame.setAttribute('aria-hidden', 'true')
    document.body.append(frame)

    try {
        const target = frame.contentDocument
        const targetWindow = frame.contentWindow
        if (!target || !targetWindow) {
            throw new Error('Could not open the contract for printing.')
        }
        target.title = title
        target.documentElement.lang = 'en'
        target.body.append(source.cloneNode(true))
        const styles = Array.from(
            document.querySelectorAll('link[rel="stylesheet"], style'),
        )
        const pageStyles = document.createElement('link')
        pageStyles.rel = 'stylesheet'
        pageStyles.href = contractPrintStylesUrl
        styles.push(pageStyles)
        await Promise.all(styles.map(copyStylesheet))
        await target.fonts.ready

        // Some browsers return before the print dialog closes.
        const cleanupTimer = globalThis.setTimeout(() => frame.remove(), 60_000)
        targetWindow.addEventListener('afterprint', cleanup, { once: true })
        targetWindow.focus()
        targetWindow.print()

        function cleanup() {
            globalThis.clearTimeout(cleanupTimer)
            frame.remove()
        }

        function copyStylesheet(stylesheet: Element): Promise<void> {
            const clone = stylesheet.cloneNode(true)
            if (!(clone instanceof HTMLLinkElement)) {
                target!.head.append(clone)
                return Promise.resolve()
            }
            return new Promise((resolve, reject) => {
                const timeout = globalThis.setTimeout(fail, 10_000)
                clone.onload = function () {
                    globalThis.clearTimeout(timeout)
                    resolve()
                }
                clone.onerror = fail
                target!.head.append(clone)

                function fail() {
                    globalThis.clearTimeout(timeout)
                    reject(
                        new Error(
                            'Print styles could not be loaded. Please retry.',
                        ),
                    )
                }
            })
        }
    } catch (error) {
        frame.remove()
        throw error
    }
}

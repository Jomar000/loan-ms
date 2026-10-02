<script lang="ts">
    import type HlsPlayer from 'hls.js'
    import type { Attachment } from 'svelte/attachments'

    import { cn } from '$lib/utils.js'

    interface Props {
        /** Automatically begin playback when the browser allows it. */
        autoplay?: boolean
        /** Additional classes forwarded to the video element. */
        class?: string
        /** Show the browser's native media controls. */
        controls?: boolean
        /** Keep playback muted, including during autoplay. */
        muted?: boolean
        /** Called after playback reaches an unrecoverable error. */
        onerror?: (error: Error) => void
        /** Called after an HLS manifest or native source is ready. */
        onready?: () => void
        /** Maximum time to wait for the stream to become playable. */
        startupTimeoutMs?: number
        /** Accessible label for the video element. */
        title: string
        /** Complete HTTP Live Streaming manifest URL. */
        url: string
    }

    let {
        autoplay = true,
        class: className,
        controls = true,
        muted = true,
        onerror,
        onready,
        startupTimeoutMs = 15_000,
        title,
        url,
    }: Props = $props()

    function createPlayerAttachment(
        sourceUrl: string,
        handleError: Props['onerror'],
        handleReady: Props['onready'],
        playbackStartupTimeoutMs: number,
        shouldAutoplay: boolean,
    ): Attachment<HTMLVideoElement> {
        return (video) => {
            let disposed = false
            let hls: HlsPlayer | null = null
            let mediaRecoveryAttempted = false
            let networkRecoveryAttempted = false
            let startupTimeout: number | null = null

            function clearStartupTimeout() {
                if (startupTimeout === null) return

                window.clearTimeout(startupTimeout)
                startupTimeout = null
            }

            function reportError(message: string) {
                if (disposed) return

                clearStartupTimeout()
                hls?.destroy()
                hls = null
                handleError?.(new Error(message))
            }

            function handlePlayable() {
                clearStartupTimeout()
            }

            function handleNativeError() {
                reportError('The HLS stream could not be played.')
            }

            function handleNativeReady() {
                if (disposed) return
                handleReady?.()
            }

            if (playbackStartupTimeoutMs > 0) {
                startupTimeout = window.setTimeout(() => {
                    reportError(
                        'The HLS stream did not become playable in time.',
                    )
                }, playbackStartupTimeoutMs)
            }

            void import('hls.js')
                .then(({ default: Hls }) => {
                    if (disposed) return

                    if (Hls.isSupported()) {
                        hls = new Hls()
                        hls.on(Hls.Events.ERROR, (_event, data) => {
                            if (!data.fatal || disposed || hls === null) return

                            if (
                                data.type === Hls.ErrorTypes.NETWORK_ERROR &&
                                !networkRecoveryAttempted
                            ) {
                                networkRecoveryAttempted = true
                                hls.startLoad()
                                return
                            }
                            if (
                                data.type === Hls.ErrorTypes.MEDIA_ERROR &&
                                !mediaRecoveryAttempted
                            ) {
                                mediaRecoveryAttempted = true
                                hls.recoverMediaError()
                                return
                            }
                            reportError('The HLS stream could not be played.')
                        })
                        hls.once(Hls.Events.FRAG_BUFFERED, handlePlayable)
                        hls.once(Hls.Events.MANIFEST_PARSED, () => {
                            if (disposed) return
                            handleReady?.()
                            if (shouldAutoplay)
                                void video.play().catch(() => undefined)
                        })
                        hls.loadSource(sourceUrl)
                        hls.attachMedia(video)
                        return
                    }

                    if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.addEventListener('canplay', handlePlayable, {
                            once: true,
                        })
                        video.addEventListener('error', handleNativeError, {
                            once: true,
                        })
                        video.addEventListener(
                            'loadedmetadata',
                            handleNativeReady,
                            { once: true },
                        )
                        video.src = sourceUrl
                        return
                    }

                    reportError(
                        'HLS playback is not supported by this browser.',
                    )
                })
                .catch(() => {
                    reportError('The HLS player could not be loaded.')
                })

            return () => {
                disposed = true
                clearStartupTimeout()
                hls?.destroy()
                hls = null
                video.removeEventListener('canplay', handlePlayable)
                video.removeEventListener('error', handleNativeError)
                video.removeEventListener('loadedmetadata', handleNativeReady)
                video.removeAttribute('src')
                video.load()
            }
        }
    }
</script>

<!--
@component
Use `Hls` for browser-native video controls backed by HLS.js with native HLS
fallback. Import it from `@loanms/ui/shared/video`.

Provide a complete HLS manifest `url` and accessible `title`. The player uses
muted autoplay and native controls by default, reports unrecoverable playback
errors through `onerror`, and reports a startup error when HLS.js does not
buffer a fragment within 15 seconds. It destroys all playback resources when
its source changes or the component unmounts. For a remote stream, the consuming
app must allow its manifest and segment origins in CSP `media-src` and
`connect-src`.
-->

<video
    aria-label={title}
    {autoplay}
    class={cn('block bg-black object-contain', className)}
    {controls}
    {muted}
    playsinline
    preload="auto"
    {@attach createPlayerAttachment(
        url,
        onerror,
        onready,
        startupTimeoutMs,
        autoplay,
    )}
></video>

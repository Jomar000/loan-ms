<script lang="ts">
    import { IMG_logo } from '$lib/assets/image'
</script>

<div
    aria-label="Loading"
    class="fixed inset-0 z-50 flex min-h-svh w-full items-center justify-center bg-background px-6"
    role="status"
>
    <div class="flex max-w-xs flex-col items-center gap-6 text-center">
        <img
            alt="Loan Management System logo"
            class="size-32 object-contain sm:size-36"
            height="144"
            src={IMG_logo}
            width="144"
        />
        <div class="grid gap-1.5">
            <p class="text-base font-semibold tracking-tight text-foreground">
                Loan Management System
            </p>
            <p class="text-sm text-muted-foreground">Loading your workspace…</p>
        </div>
        <div
            aria-hidden="true"
            class="h-1 w-40 overflow-hidden rounded-full bg-primary/15"
        >
            <div
                class="loading-progress h-full w-1/3 rounded-full bg-primary"
            ></div>
        </div>
    </div>
</div>

<style>
    .loading-progress {
        animation: loading-slide 1.6s ease-in-out infinite;
    }

    @keyframes loading-slide {
        from {
            transform: translateX(-100%);
        }
        to {
            transform: translateX(400%);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .loading-progress {
            animation: none;
            margin-inline: auto;
        }
    }
</style>

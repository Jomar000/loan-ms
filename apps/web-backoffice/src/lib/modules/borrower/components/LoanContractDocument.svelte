<script lang="ts">
    import type { Loan } from '$lib/modules/loan/types'
    import {
        formatCurrency,
        toPercent,
    } from '$lib/modules/loan/utilities/format'
    import type { Borrower } from '../types'

    ////////////////////
    // 01. Properties //
    ////////////////////
    let {
        borrower,
        lenderAddress,
        ownerName,
        loan,
    }: {
        borrower: Borrower
        lenderAddress: string
        ownerName: string
        loan: Loan
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////
    const frequencies = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' }

    /////////////////
    // 10. Helpers //
    /////////////////
    function contractDate(value: string | null): string {
        if (!value) return 'Not recorded'
        return new Intl.DateTimeFormat('en-PH', {
            dateStyle: 'long',
            timeZone: 'Asia/Manila',
        }).format(new Date(value))
    }
</script>

<article
    aria-label="Loan contract"
    class="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-lg border border-border bg-card p-4 font-serif text-sm/6 wrap-break-word text-card-foreground sm:p-8 print:max-w-none print:gap-3 print:rounded-none print:border-0 print:p-0 print:text-[10pt] print:leading-[1.35] print:[&>section]:break-inside-avoid print:[&>section]:gap-1.5"
>
    <header class="flex flex-col gap-1 text-center">
        <h2 class="text-lg font-bold print:text-[13pt]">
            LOAN AGREEMENT AND PROMISSORY NOTE
        </h2>
        <p class="font-sans text-xs">
            Loan no. {loan.loanNumber} · Borrower no. {borrower.borrowerNumber}
        </p>
        <p class="font-sans text-xs">
            Recorded status: {loan.status.replaceAll('_', ' ')}
        </p>
    </header>

    <p>
        This Loan Agreement is entered into on ____________________ at
        ____________________, Philippines, by and between
        <strong>{ownerName.trim() || '[Owner full name]'}</strong>, with address
        at
        {lenderAddress.trim() || '[Lender address]'} (the “Lender”), and
        <strong>{borrower.fullName}</strong>, residing at {borrower.addressLine},
        {borrower.barangay}, {borrower.cityMunicipality}, {borrower.province}
        (the “Borrower”). The parties agree as follows:
    </p>

    <section class="flex flex-col gap-2">
        <h3 class="font-bold">1. Loan amount and agreed interest</h3>
        <p>
            The Lender agrees to lend the Borrower a principal amount of
            <strong>{formatCurrency(loan.principalMinor)}</strong>. The agreed
            interest for the entire loan term is
            <strong>{formatCurrency(loan.interestAmountMinor)}</strong>, making
            the total scheduled repayment
            <strong>{formatCurrency(loan.totalPayableMinor)}</strong>.
            {#if loan.formulaSnapshot.interestMethod === 'FLAT_PERCENTAGE' && loan.formulaSnapshot.interestRateBasisPoints !== null}
                The recorded interest method is a flat rate of
                {toPercent(loan.formulaSnapshot.interestRateBasisPoints)} on the original
                principal for the entire term, not an annual or effective interest
                rate.
            {:else}
                The recorded interest method is a fixed amount for the entire
                term.
            {/if}
            The recorded term is {loan.formulaSnapshot.termDays} days.
        </p>
    </section>

    <section class="flex flex-col gap-2">
        <h3 class="font-bold">2. Release of funds</h3>
        <p>
            Scheduled release date: {contractDate(loan.releaseDate)}. Actual
            release recorded: {contractDate(loan.releasedAt)}. Signing this
            Agreement does not by itself acknowledge receipt of funds. Actual
            delivery of the loan proceeds must be separately documented.
        </p>
    </section>

    <section class="flex flex-col gap-2">
        <h3 class="font-bold">3. Promise to pay and repayment summary</h3>
        <p>
            Upon actual receipt of the principal, the Borrower promises to repay
            the Lender the principal and agreed interest stated above in
            {frequencies[loan.formulaSnapshot.paymentFrequency]}
            installments as summarized below. Amounts already paid remain credited
            to the Borrower’s account; the scheduled total is not a statement of the
            current outstanding balance.
        </p>
        <dl
            aria-label="Repayment summary"
            class="grid gap-3 sm:grid-cols-3 print:grid-cols-3"
        >
            <div>
                <dt class="font-semibold">Total installments</dt>
                <dd class="font-mono tabular-nums">
                    {loan.formulaSnapshot.installmentCount}
                </dd>
            </div>
            <div>
                <dt class="font-semibold">Daily payment</dt>
                <dd class="font-mono tabular-nums">
                    {formatCurrency(loan.dailyPaymentAmountMinor)}
                </dd>
            </div>
            <div>
                <dt class="font-semibold">Expected finish date</dt>
                <dd>{contractDate(loan.expectedCompletionDate)}</dd>
            </div>
        </dl>
    </section>

    <section class="flex flex-col gap-2">
        <h3 class="font-bold">4. Payments, charges, and changes</h3>
        <p>
            The Lender shall issue a receipt for each payment. This Agreement
            does not impose any additional fee, late-payment penalty,
            compounding, collateral, or automatic acceleration. Any additional
            arrangement or amendment must be separately agreed in writing by
            both parties and comply with applicable Philippine law. Any
            disclosures required by applicable lending laws must be separately
            furnished before execution.
        </p>
    </section>

    <section class="flex flex-col gap-2">
        <h3 class="font-bold">5. Voluntary agreement and governing law</h3>
        <p>
            The parties confirm that they have read and understood this
            Agreement, have had an opportunity to ask questions, and voluntarily
            accept the stated terms. Each party shall receive a signed copy.
            This Agreement shall be governed by the applicable laws of the
            Republic of the Philippines. Nothing herein waives rights or
            remedies provided by law.
        </p>
    </section>

    <section
        aria-label="Contract signatures"
        class="grid break-inside-avoid grid-cols-1 gap-8 pt-8 sm:grid-cols-2 print:grid-cols-2 print:pt-6"
    >
        <div class="flex flex-col gap-1 border-t border-foreground pt-2">
            <p class="font-bold">{borrower.fullName}</p>
            <p>Borrower — signature over printed name</p>
            <p>Date: ____________________</p>
        </div>
        <div class="flex flex-col gap-1 border-t border-foreground pt-2">
            <p class="font-bold">{ownerName.trim() || '[Owner full name]'}</p>
            <p>Owner / Lender — signature over printed name</p>
            <p>Date: ____________________</p>
        </div>
    </section>
</article>

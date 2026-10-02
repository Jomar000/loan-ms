# Icons

Use the project's icon policy and installed package. Check `packages/ui/components.json` when it declares `iconLibrary`; otherwise follow `svelte-patterns`, which is authoritative for this repository's icon imports. Never infer a different library from upstream examples.

---

## Icons in Button use data-icon attribute

Add `data-icon="inline-start"` (prefix) or `data-icon="inline-end"` (suffix) to the icon. No sizing classes on the icon.

**Incorrect:**

```svelte
<script lang="ts">
  import { Button } from "@PROJECT_NAME/ui/components/button";
  import SearchIcon from "@lucide/svelte/icons/search";
</script>

<Button>
  <SearchIcon class="mr-2 size-4" />
  Search
</Button>
```

**Correct:**

```svelte
<script lang="ts">
  import { Button } from "@PROJECT_NAME/ui/components/button";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
</script>

<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

<Button>
  Next
  <ArrowRightIcon data-icon="inline-end" />
</Button>
```

---

## No redundant sizing when a parent component owns icon size

Parents such as `<Button>`, `Badge`, `Alert.Root`, menu items, and `Sidebar.*` size their descendant icons through CSS. Don't add `size-4`, `w-4 h-4`, or other sizing classes there. Retain explicit sizes in plain controls/containers, inside parents without icon-size rules, or for an intentional visual exception documented by the project.

**Incorrect:**

```svelte
<script lang="ts">
  import { Button } from "@PROJECT_NAME/ui/components/button";
  import SearchIcon from "@lucide/svelte/icons/search";
</script>

<Button>
  <SearchIcon class="size-4" data-icon="inline-start" />
  Search
</Button>
```

**Correct:**

```svelte
<script lang="ts">
  import { Button } from "@PROJECT_NAME/ui/components/button";
  import SearchIcon from "@lucide/svelte/icons/search";
</script>

<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>
```

Confirm the installed parent source owns icon sizing before removing a class; the rule is based on the parent's CSS contract, not merely on being nested somewhere inside a component.

---

## Pass icons as components, not string keys

Use a component reference, not a string key to a lookup map.

**Incorrect:**

```svelte
<!-- String key lookup — avoid -->
<DynamicIcon name="check" />
```

**Correct:**

```svelte
<script lang="ts">
  import type { Component } from "svelte";
  import CheckIcon from "@lucide/svelte/icons/check";

  let { Icon }: { Icon: Component } = $props();
</script>

<Icon />

<!-- <StatusBadge Icon={CheckIcon} /> -->
```

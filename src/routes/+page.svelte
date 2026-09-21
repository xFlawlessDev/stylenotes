<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { invoke } from "@tauri-apps/api/core";

  let name = $state("");
  let greetMsg = $state("");

  async function greet(event: Event) {
    event.preventDefault();
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsg = await invoke("greet", { name });
  }
</script>

<main class="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
  <Card.Root class="w-full max-w-sm">
    <Card.Header>
      <Card.Title>Stylenotes</Card.Title>
      <Card.Description>Tauri + SvelteKit + Tailwind 4 + shadcn-svelte</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="flex flex-col gap-2" onsubmit={greet}>
        <Input placeholder="Enter a name..." bind:value={name} />
        <Button type="submit">Greet</Button>
      </form>
      {#if greetMsg}<p class="text-sm text-muted-foreground">{greetMsg}</p>{/if}
    </Card.Content>
  </Card.Root>
</main>
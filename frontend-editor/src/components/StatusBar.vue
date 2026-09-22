<template>
  <footer class="status">
    <span class="status__item">{{ store.statusText }}</span>
    <template v-if="store.taskTotal > 0">
      <span class="status__sep">·</span>
      <span class="status__item status__tasks" :class="{ 'status__tasks--done': store.taskDone === store.taskTotal }">
        ✓ {{ store.taskDone }}/{{ store.taskTotal }}
      </span>
    </template>
    <span class="status__sep">·</span>
    <span class="status__item">Markdown</span>
    <span class="status__sep">·</span>
    <span class="status__item">UTF-8</span>
  </footer>
</template>

<script setup>
import { useEditorStore } from '@/stores/editor'
const store = useEditorStore()
</script>

<style lang="scss" scoped>
.status {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  gap: $sp-2;
  background: $bg-elevated;
  border-top: 1px solid $border-light;
  flex-shrink: 0;

  &__item {
    font-size: $fs-xs;
    color: $text-3;
    font-family: $font-mono;
  }

  &__sep {
    font-size: $fs-xs;
    color: $border;
  }

  &__tasks {
    color: $text-2;

    &--done {
      color: $success;
    }
  }
}
</style>

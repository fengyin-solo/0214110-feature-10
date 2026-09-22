<template>
  <footer class="status">
    <span class="status__item">{{ store.statusText }}</span>
    <span class="status__sep">·</span>
    <span
      v-if="store.taskStats.total > 0"
      class="status__tasks"
      :title="taskTitle"
    >
      <span class="status__tasks-text">
        任务 {{ store.taskStats.done }}/{{ store.taskStats.total }}<template v-if="store.taskStats.unknown > 0">（{{ store.taskStats.unknown }} 未识别）</template>
      </span>
      <span class="status__progress" aria-hidden="true">
        <span class="status__progress-done" :style="{ width: doneWidth }" />
        <span
          v-if="store.taskStats.unknown > 0"
          class="status__progress-unknown"
          :style="{ left: doneWidth, width: unknownWidth }"
        />
      </span>
    </span>
    <template v-if="store.taskStats.total > 0"><span class="status__sep">·</span></template>
    <span class="status__item" :class="saveClass">{{ store.saveStatus.text }}</span>
    <template v-if="store.saveStatus.text"><span class="status__sep">·</span></template>
    <span class="status__item">Markdown</span>
    <span class="status__sep">·</span>
    <span class="status__item">UTF-8</span>
  </footer>
</template>

<script setup>
import { computed } from 'vue'
import { useEditorStore } from '@/stores/editor'
const store = useEditorStore()

const doneWidth = computed(() => `${store.taskStats.percent}%`)
const unknownWidth = computed(() =>
  store.taskStats.total ? `${(store.taskStats.unknown / store.taskStats.total) * 100}%` : '0%'
)
const taskTitle = computed(() =>
  store.taskStats.unknown > 0
    ? `已完成 ${store.taskStats.done} 项，${store.taskStats.unknown} 项为未知完成状态（原样保留）`
    : `已完成 ${store.taskStats.done} / ${store.taskStats.total} 项`
)
const saveClass = computed(() => {
  const key = store.saveStatus.key
  return key === 'saved'
    ? 'status__item--saved'
    : key === 'error'
      ? 'status__item--error'
      : 'status__item--pending'
})
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

    &--saved { color: $success; }
    &--pending { color: $warning; }
    &--error { color: $error; }
  }

  &__sep {
    font-size: $fs-xs;
    color: $border;
  }

  &__tasks {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: $fs-xs;
    color: $text-2;
    font-family: $font-mono;
    cursor: default;
  }

  &__progress {
    position: relative;
    width: 56px;
    height: 4px;
    border-radius: $r-full;
    background: $border-light;
    overflow: hidden;
  }

  &__progress-done {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    background: $accent;
    border-radius: $r-full;
    transition: width $t-normal $ease;
  }

  &__progress-unknown {
    position: absolute;
    top: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      -45deg,
      $warning,
      $warning 3px,
      rgba(217, 119, 6, 0.4) 3px,
      rgba(217, 119, 6, 0.4) 6px
    );
    transition: left $t-normal $ease, width $t-normal $ease;
  }
}
</style>

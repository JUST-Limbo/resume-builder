<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import {
  FilePenLine,
  FileText,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-vue-next'

const SIDEBAR_COLLAPSED_KEY = 'resume-builder:sidebar-collapsed'

const route = useRoute()
const sidebarCollapsed = useLocalStorage(SIDEBAR_COLLAPSED_KEY, false)

const editTo = computed(() => {
  const id = route.params.id
  if (route.name === 'edit' && typeof id === 'string' && id.length > 0) {
    return { name: 'edit' as const, params: { id } }
  }
  return { name: 'edit' as const }
})

const isMine = computed(() => route.name === 'mine')
const isTemplates = computed(() => route.name === 'templates')
const isEdit = computed(() => route.name === 'edit')

const collapseToggleLabel = computed(() => {
  if (sidebarCollapsed.value) return '展开侧栏'
  return '收起侧栏'
})

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function navTitle(label: string) {
  if (sidebarCollapsed.value) return label
  return undefined
}
</script>

<template>
  <div class="app-layout">
    <aside
      class="app-sidebar"
      :class="{ 'app-sidebar--collapsed': sidebarCollapsed }"
      aria-label="主导航"
    >
      <!--
        内层宽度瞬时切换、外层 width 做过渡 + overflow:hidden。
        展开动画期间文字按完整展开宽排版，只被裁切，不会挤成竖排。
      -->
      <div class="app-sidebar__inner">
        <div class="app-sidebar__brand">
          <span
            v-if="sidebarCollapsed"
            class="app-sidebar__brand-mark"
            aria-hidden="true"
          >R</span>
          <template v-else>
            <strong class="app-sidebar__brand-title">本地工作台</strong>
            <p class="app-sidebar__eyebrow">RESUME</p>
          </template>
        </div>
        <nav class="app-sidebar__nav">
          <RouterLink
            class="app-nav-item"
            :class="{ 'app-nav-item--active': isMine }"
            :to="{ name: 'mine' }"
            :title="navTitle('我的')"
          >
            <FileText :size="16" />
            <span v-if="!sidebarCollapsed">我的</span>
          </RouterLink>
          <RouterLink
            class="app-nav-item"
            :class="{ 'app-nav-item--active': isTemplates }"
            :to="{ name: 'templates' }"
            :title="navTitle('简历模板')"
          >
            <LayoutTemplate :size="16" />
            <span v-if="!sidebarCollapsed">简历模板</span>
          </RouterLink>
          <RouterLink
            class="app-nav-item"
            :class="{ 'app-nav-item--active': isEdit }"
            :to="editTo"
            :title="navTitle('简历编辑')"
          >
            <FilePenLine :size="16" />
            <span v-if="!sidebarCollapsed">简历编辑</span>
          </RouterLink>
        </nav>
        <button
          type="button"
          class="app-sidebar__toggle"
          :title="collapseToggleLabel"
          :aria-label="collapseToggleLabel"
          :aria-expanded="!sidebarCollapsed"
          @click="toggleSidebar"
        >
          <PanelLeftOpen v-if="sidebarCollapsed" :size="16" />
          <PanelLeftClose v-else :size="16" />
          <span
            v-if="!sidebarCollapsed"
            class="app-sidebar__toggle-label"
          >{{ collapseToggleLabel }}</span>
        </button>
      </div>
    </aside>
    <div class="app-main">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f1f3f4;
}

.app-sidebar {
  flex-shrink: 0;
  width: 200px;
  overflow: hidden;
  color: #202428;
  background: #fff;
  border-right: 1px solid #e2e5e6;
  transition: width 0.18s ease;
}

.app-sidebar--collapsed {
  width: 56px;
}

.app-sidebar__inner {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 200px;
  min-width: 200px;
  height: 100%;
  padding: 18px 14px 16px;
}

.app-sidebar--collapsed .app-sidebar__inner {
  width: 56px;
  min-width: 56px;
  padding: 18px 8px 12px;
}

.app-sidebar__brand {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 0 6px 18px;
  border-bottom: 1px solid #eef0f1;
  margin-bottom: 14px;
  overflow: hidden;
}

.app-sidebar--collapsed .app-sidebar__brand {
  justify-content: center;
  align-items: center;
  gap: 0;
  padding: 0 0 14px;
}

.app-sidebar__brand-mark {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #eceeef;
  color: #111;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
}

.app-sidebar__eyebrow {
  margin: 0;
  color: #8b9296;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.17em;
  white-space: nowrap;
  overflow: hidden;
}

.app-sidebar__brand-title {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
}

.app-sidebar__nav {
  display: grid;
  gap: 4px;
}

.app-nav-item {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  color: #5f676c;
  text-decoration: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  transition: background 0.15s ease, color 0.15s ease;
}

.app-nav-item :deep(svg) {
  flex-shrink: 0;
}

.app-nav-item span,
.app-sidebar__toggle-label {
  flex: 0 0 auto;
  white-space: nowrap;
}

.app-sidebar--collapsed .app-nav-item {
  justify-content: center;
  padding: 9px 0;
  gap: 0;
}

.app-nav-item:hover {
  color: #202428;
  background: #f5f6f7;
}

.app-nav-item--active {
  color: #111;
  background: #eceeef;
  font-weight: 650;
}

.app-sidebar__toggle {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: auto;
  padding: 9px 10px;
  color: #5f676c;
  background: transparent;
  border: 0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.app-sidebar__toggle :deep(svg) {
  flex-shrink: 0;
}

.app-sidebar__toggle:hover {
  color: #202428;
  background: #f5f6f7;
}

.app-sidebar--collapsed .app-sidebar__toggle {
  justify-content: center;
  padding: 9px 0;
  gap: 0;
}

.app-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

/* 禅模式占满右侧时隐藏侧栏 */
.app-layout:has(.app-shell--zen) .app-sidebar {
  display: none;
}
</style>

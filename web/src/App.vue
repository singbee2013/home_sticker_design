<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
const theme = useThemeStore()
onMounted(() => theme.applyInitial())
</script>

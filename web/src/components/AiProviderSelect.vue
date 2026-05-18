<template>
  <el-select
    :model-value="modelValue"
    class="ai-provider-select"
    popper-class="ai-provider-select-popper notranslate"
    translate="no"
    v-bind="$attrs"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-option
      v-for="p in optionList"
      :key="p"
      :value="p"
      :label="providerLabel(p)"
    >
      <span class="provider-option-text notranslate" translate="no" lang="en">{{ providerLabel(p) }}</span>
    </el-option>
  </el-select>
</template>

<script setup>
import { computed } from 'vue'
import { initStandardProviderList, providerLabel } from '@/utils/aiProviders'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  modelValue: { type: String, required: true },
  providers: { type: Array, default: null },
})

defineEmits(['update:modelValue'])

const optionList = computed(() => props.providers?.length ? props.providers : initStandardProviderList())
</script>

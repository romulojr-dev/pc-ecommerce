import { specValue } from "../format"
import { one, type Rule } from "./rule"

// Exactly the case's limit fits; spec 001's rounding already errs on the
// safe side
export const gpuLength: Rule = {
  id: "gpu-length",
  severity: "error",
  check(build) {
    const gpu = one(build, "gpu")
    const pcCase = one(build, "case")
    if (!gpu || !pcCase) return null
    if (gpu.specs.lengthMm <= pcCase.specs.maxGpuLengthMm) return null
    const length = specValue("gpu", "lengthMm", gpu.specs.lengthMm)
    const limit = specValue(
      "case",
      "maxGpuLengthMm",
      pcCase.specs.maxGpuLengthMm
    )
    return {
      parts: [gpu, pcCase],
      message: `The ${gpu.name} is ${length} long, but the ${pcCase.name} fits graphics cards up to ${limit}.`,
    }
  },
}

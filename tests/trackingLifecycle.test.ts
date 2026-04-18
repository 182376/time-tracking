import {
  assert,
  finishTrackingLifecycleTests,
  runTest,
} from "./trackingLifecycle/shared.ts";
import { runCompilerAndAggregationTests } from "./trackingLifecycle/compilerAndAggregation.ts";
import { runHistoryReadModelTests } from "./trackingLifecycle/historyReadModel.ts";
import { runLifecycleCoreTests } from "./trackingLifecycle/lifecycleCore.ts";
import { runProcessMapperTests } from "./trackingLifecycle/processMapper.ts";
import { runReadModelRuntimeTests } from "./trackingLifecycle/readModelRuntime.ts";
import { runRuntimeEffectsTests } from "./trackingLifecycle/runtimeEffects.ts";

runLifecycleCoreTests();
runRuntimeEffectsTests();
runHistoryReadModelTests();
runReadModelRuntimeTests();
runCompilerAndAggregationTests();
runProcessMapperTests();

runTest("tracking lifecycle entrypoint keeps grouped modules wired once", () => {
  assert.equal(typeof runLifecycleCoreTests, "function");
  assert.equal(typeof runRuntimeEffectsTests, "function");
  assert.equal(typeof runHistoryReadModelTests, "function");
  assert.equal(typeof runReadModelRuntimeTests, "function");
  assert.equal(typeof runCompilerAndAggregationTests, "function");
  assert.equal(typeof runProcessMapperTests, "function");
});

await finishTrackingLifecycleTests();

import { assertEquals } from "https://deno.land/std@v0.39.0/testing/asserts.ts";

Deno.test(function t1() {
  assertEquals("world", "world");
});

// テスト名称をパラメータで指定する
Deno.test({
  name: 'Test Name',
  fn: function t2() {
    assertEquals("hello", "hello");
  }
});


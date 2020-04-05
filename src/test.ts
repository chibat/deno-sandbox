import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

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


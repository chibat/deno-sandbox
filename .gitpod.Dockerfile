FROM gitpod/workspace-full

ENV DENO_DIR=/workspace/.deno

RUN curl -fsSL https://deno.land/x/install/install.sh | sh v0.39.0

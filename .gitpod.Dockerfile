FROM gitpod/workspace-full

ENV DENO_DIR=/workspace/.deno
ENV DENO_INSTALL=/workspace/.deno

RUN export PATH=$DENO_INSTALL/bin:$PATH
RUN curl -fsSL https://deno.land/x/install/install.sh | sh -s v0.40.0
RUN set -o vi

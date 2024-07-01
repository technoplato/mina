{
  "targets": [
    {
      "target_name": "addon",
      "sources": [
        "whisper.cpp/ggml/src/ggml.c",
        "whisper.cpp/ggml/src/ggml-alloc.c",
        "whisper.cpp/ggml/src/ggml-backend.c",
        "whisper.cpp/ggml/src/ggml-quants.c",
        "whisper.cpp/src/whisper.cpp",
        "native/stt_whisper.cc",
        "native/addon.cc"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "cflags": [
        "-std=c11",
        "-O3",
        "-DGGML_USE_ACCELERATE"
      ],
      "cflags_cc": [
        "-std=c++11",
        "-O3",
        "-DGGML_USE_ACCELERATE"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "whisper.cpp",
        "whisper.cpp/ggml/include",
        "whisper.cpp/include"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "WHISPER_SHARED=1",
        "GGML_USE_ACCELERATE"
      ],
      "conditions": [
        [
          "OS==\"win\"",
          {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1
              }
            }
          }
        ],
        [
          "OS==\"mac\"",
          {
            "xcode_settings": {
              "CLANG_CXX_LIBRARY": "libc++",
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "MACOSX_DEPLOYMENT_TARGET": "10.7",
              "OTHER_CFLAGS": [
                "-DGGML_USE_ACCELERATE",
                "-O3",
                "-std=c11"
              ],
              "OTHER_CPLUSPLUSFLAGS": [
                "-std=c++11",
                "-O3"
              ],
              "OTHER_LDFLAGS": [
                "-framework Accelerate"
              ]
            }
          }
        ]
      ]
    }
  ]
}

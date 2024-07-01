{
  "targets": [
    {
      "target_name": "addon",
      "sources": [
        "whisper.cpp/ggml.c",
        "whisper.cpp/whisper.cpp",
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
        "-std=c11"
      ],
      "cflags_cc": [
        "-std=c++11"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "whisper.cpp"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "WHISPER_SHARED=1"
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
                "-std=c11"
              ],
              "OTHER_CPLUSPLUSFLAGS": [
                "-std=c++11"
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

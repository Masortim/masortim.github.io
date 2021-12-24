var myPlayListPlayer;
    jQuery(function () {
      /**
       * Set the video list with all the parameters for each video
       * @type {*[]}
       */
      var videos = [
        {
          videoURL: "k_okcNVZqqI", // INK DROPS
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 0,
          stopAt: 159,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "AaA246e4u_A", // Drippy Eye Projections Oil Wheel 056
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 0,
          // stopAt: 75,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "XVkADAwOXnU", // лучший расслабляющий аквариум
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 0,
          // stopAt: 75,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "lyh2kAjcmSY", // Russia 4K
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 11,
          // stopAt: 75,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "cg_kcaymWK0", // 京都の紅葉60選 : The 60 Best Autumn Leaves Spots In Kyoto
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 5,
          // stopAt: 75,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "eRUQPfVACs0", // Norway in 8K ULTRA HD HDR - Most peaceful Country in the World
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 8,
          stopAt: 1160,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "JABGEOY8XS4", // Рождение тритона
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 10,
          stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "PpUgBpeJqT0", // 【中山道の桜】馬籠から妻籠への道のり :【Samurai Trail】Walking the Nakasendo from Magome to Tsumago (Gifu-Nagano, Japan)
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 0,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "SiwWL76ZlPQ", // 8k HDR Dolby Vision | Best of 2021
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 0,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "RzVvThhjAKw", // Nature Forest 4K Nature scenery, Beautiful Relaxing Music • Our Planet by Relaxation Film
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 11,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "XqmNiWsZ3m0", // Aquarium 4K VIDEO (ULTRA HD) 🐠 Beautiful Relaxing Coral Reef Fish - Relaxing Sleep Meditation Music
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 0,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "DN0mpbWwDvw", // Музыка с глубоким фокусом для улучшения концентрации
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 0,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "HwtgRuV2b84", // Liquid Light Show Bright Edition
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 8,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "njX2bu-_Vw4", // 2020 LG OLED l The Black 4K HDR 60fps
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 0,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "gLcpjY3Gm2E", // 8k HDR Dolby Vision
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 20,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        },
        {
          videoURL: "7KXGZAEWzn0", // ORBIT - Journey Around Earth in Real Time | 4K Remastered
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 86,
          // stopAt: 363,
          opacity: 1,
          loop: false,
          ratio: 4/3,
          addRaster: true,
          quality: "large",
        }
      ];
    let filters = {
      brightness: 50,
    }
    jQuery('#myPlayerID').YTPApplyFilters(filters);

      myPlayListPlayer = jQuery("#myPlayerID").YTPlaylist(videos, true, function (video) {
        /*
                        if (video.videoData) {
                            jQuery("#videoID").html(video.videoData.id);
                            jQuery("#videoTitle").html(video.videoData.title);
                        }
        */
      });

      myPlayListPlayer.on("YTPData", function (e) {
        jQuery("#videoID").html(e.prop.id);
        jQuery("#videoTitle").html(e.prop.title);
      });

    });

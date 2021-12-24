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
          videoURL: "Y_plhk1FUQA", // COSMIC RELAXATION: 8 HOURS of 4K Deep Space NASA Footage + Chillout Music for Studying, Working, Etc
          containment: 'body',
          autoPlay: true,
          mute: true,
          startAt: 22,
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

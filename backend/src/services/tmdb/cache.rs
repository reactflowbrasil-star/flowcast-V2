use super::*;
use std::io::ErrorKind;
use tokio::fs;
use tracing::info;

impl TmdbService {
    pub(crate) async fn read_cached_movie_details(
        &self,
        tmdb_id: i64,
    ) -> Result<Option<TmdbMovieDetails>, AppError> {
        let root = self.get_metadata_path().await?;
        let file_path = root.join("movies").join(format!("{}.json", tmdb_id));

        match fs::read(&file_path).await {
            Ok(bytes) => {
                let movie = serde_json::from_slice::<TmdbMovieDetails>(&bytes)?;
                Ok(Some(movie))
            }
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    pub(crate) async fn read_cached_tv_details(
        &self,
        tmdb_id: i64,
    ) -> Result<Option<TmdbTvDetails>, AppError> {
        let root = self.get_metadata_path().await?;
        let file_path = root
            .join("series")
            .join(tmdb_id.to_string())
            .join("series.json");

        match fs::read(&file_path).await {
            Ok(bytes) => {
                let tv = serde_json::from_slice::<TmdbTvDetails>(&bytes)?;
                Ok(Some(tv))
            }
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    pub(crate) async fn read_cached_season_details(
        &self,
        tmdb_id: i64,
        season_number: i32,
    ) -> Result<Option<TmdbSeasonDetails>, AppError> {
        let root = self.get_metadata_path().await?;
        let file_path = root
            .join("series")
            .join(tmdb_id.to_string())
            .join(format!("season_{}.json", season_number));

        match fs::read(&file_path).await {
            Ok(bytes) => {
                let season = serde_json::from_slice::<TmdbSeasonDetails>(&bytes)?;
                Ok(Some(season))
            }
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    pub(crate) async fn cache_movie_details(
        &self,
        mut movie: TmdbMovieDetails,
    ) -> Result<TmdbMovieDetails, AppError> {
        let root = self.ensure_metadata_dirs().await?;
        let preferred_format = self.get_preferred_format().await?;

        if let Some(remote_path) = movie.poster_path.clone() {
            movie.poster_path = self
                .download_and_store_image(
                    &remote_path,
                    &root,
                    "posters",
                    &format!("movie_{}", movie.id),
                    &preferred_format,
                )
                .await?;
        }

        if let Some(remote_path) = movie.backdrop_path.clone() {
            movie.backdrop_path = self
                .download_and_store_image(
                    &remote_path,
                    &root,
                    "backdrops",
                    &format!("movie_{}", movie.id),
                    &preferred_format,
                )
                .await?;
        }

        let file_path = root.join("movies").join(format!("{}.json", movie.id));
        fs::write(&file_path, serde_json::to_vec_pretty(&movie)?).await?;
        info!(
            "Cached TMDB movie {} metadata at {}",
            movie.id,
            file_path.display()
        );

        Ok(movie)
    }

    pub(crate) async fn cache_tv_details(&self, mut tv: TmdbTvDetails) -> Result<TmdbTvDetails, AppError> {
        let root = self.ensure_metadata_dirs().await?;
        let preferred_format = self.get_preferred_format().await?;
        let series_dir = root.join("series").join(tv.id.to_string());
        if !series_dir.exists() {
            fs::create_dir_all(&series_dir).await?;
        }

        if let Some(remote_path) = tv.poster_path.clone() {
            tv.poster_path = self
                .download_and_store_image(
                    &remote_path,
                    &root,
                    "posters",
                    &format!("tv_{}", tv.id),
                    &preferred_format,
                )
                .await?;
        }

        if let Some(remote_path) = tv.backdrop_path.clone() {
            tv.backdrop_path = self
                .download_and_store_image(
                    &remote_path,
                    &root,
                    "backdrops",
                    &format!("tv_{}", tv.id),
                    &preferred_format,
                )
                .await?;
        }

        let mut seasons = Vec::with_capacity(tv.seasons.len());
        for season in tv.seasons.into_iter() {
            let mut season_local = season;
            if let Some(remote_path) = season_local.poster_path.clone() {
                season_local.poster_path = self
                    .download_and_store_image(
                        &remote_path,
                        &root,
                        "seasons",
                        &format!("season_{}", season_local.id),
                        &preferred_format,
                    )
                    .await?;
            }
            seasons.push(season_local);
        }
        tv.seasons = seasons;

        let file_path = series_dir.join("series.json");
        fs::write(&file_path, serde_json::to_vec_pretty(&tv)?).await?;
        info!(
            "Cached TMDB series {} metadata at {}",
            tv.id,
            file_path.display()
        );

        Ok(tv)
    }

    pub(crate) async fn cache_season_details(
        &self,
        tmdb_id: i64,
        mut season: TmdbSeasonDetails,
    ) -> Result<TmdbSeasonDetails, AppError> {
        let root = self.ensure_metadata_dirs().await?;
        let preferred_format = self.get_preferred_format().await?;
        let series_dir = root.join("series").join(tmdb_id.to_string());
        if !series_dir.exists() {
            fs::create_dir_all(&series_dir).await?;
        }

        if let Some(remote_path) = season.poster_path.clone() {
            season.poster_path = self
                .download_and_store_image(
                    &remote_path,
                    &root,
                    "seasons",
                    &format!("season_{}", season.id),
                    &preferred_format,
                )
                .await?;
        }

        for episode in season.episodes.iter_mut() {
            if let Some(remote_path) = episode.still_path.clone() {
                episode.still_path = self
                    .download_and_store_image(
                        &remote_path,
                        &root,
                        "stills",
                        &format!("episode_{}", episode.id),
                        &preferred_format,
                    )
                    .await?;
            }
        }

        let file_path = series_dir.join(format!("season_{}.json", season.season_number));
        fs::write(&file_path, serde_json::to_vec_pretty(&season)?).await?;
        info!(
            "Cached TMDB season {} for series {} at {}",
            season.season_number,
            tmdb_id,
            file_path.display()
        );

        Ok(season)
    }
}

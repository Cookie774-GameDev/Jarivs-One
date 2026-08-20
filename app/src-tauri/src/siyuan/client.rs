//! Closed, typed broker contract for the small SiYuan API subset approved for Phase 1.

pub const MAX_IDENTIFIER_BYTES: usize = 128;
pub const MAX_QUERY_BYTES: usize = 512;
pub const MAX_SEARCH_RESULTS: u16 = 100;
pub const MAX_BLOCK_CONTENT_BYTES: usize = 1_048_576;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeStatus {
    pub state: String,
    pub runtime_bundled: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeVersion {
    pub version: String,
    pub commit: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub closed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlockSummary {
    pub id: String,
    pub notebook_id: String,
    pub path: String,
    pub content: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Block {
    pub id: String,
    pub notebook_id: String,
    pub path: String,
    pub markdown: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BrokerRequest<'a> {
    Status,
    Version,
    ListNotebooks,
    SearchBlocks { query: &'a str, limit: u16 },
    GetBlock { id: &'a str },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BrokerResponse {
    Status(RuntimeStatus),
    Version(RuntimeVersion),
    Notebooks(Vec<Notebook>),
    SearchResults(Vec<BlockSummary>),
    Block(Block),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClientError {
    FeatureDisabled,
    InvalidIdentifier,
    InvalidQuery,
    InvalidLimit,
    ResponseTooLarge,
    ResponseTypeMismatch,
    TransportUnavailable,
}

impl std::fmt::Display for ClientError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::FeatureDisabled => "siyuan_feature_disabled",
            Self::InvalidIdentifier => "siyuan_identifier_invalid",
            Self::InvalidQuery => "siyuan_query_invalid",
            Self::InvalidLimit => "siyuan_limit_invalid",
            Self::ResponseTooLarge => "siyuan_response_too_large",
            Self::ResponseTypeMismatch => "siyuan_response_type_mismatch",
            Self::TransportUnavailable => "siyuan_transport_unavailable",
        })
    }
}

pub trait SiyuanTransport {
    fn send(&self, request: BrokerRequest<'_>) -> Result<BrokerResponse, ClientError>;
}

pub struct SiyuanClient<T> {
    feature_enabled: bool,
    transport: T,
}

impl<T: SiyuanTransport> SiyuanClient<T> {
    pub fn new(feature_enabled: bool, transport: T) -> Self {
        Self {
            feature_enabled,
            transport,
        }
    }

    fn require_enabled(&self) -> Result<(), ClientError> {
        if self.feature_enabled {
            Ok(())
        } else {
            Err(ClientError::FeatureDisabled)
        }
    }

    pub fn status(&self) -> Result<RuntimeStatus, ClientError> {
        self.require_enabled()?;
        match self.transport.send(BrokerRequest::Status)? {
            BrokerResponse::Status(status) => Ok(status),
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }

    pub fn version(&self) -> Result<RuntimeVersion, ClientError> {
        self.require_enabled()?;
        match self.transport.send(BrokerRequest::Version)? {
            BrokerResponse::Version(version) => Ok(version),
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }

    pub fn list_notebooks(&self) -> Result<Vec<Notebook>, ClientError> {
        self.require_enabled()?;
        match self.transport.send(BrokerRequest::ListNotebooks)? {
            BrokerResponse::Notebooks(notebooks) => Ok(notebooks),
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }

    pub fn search_blocks(&self, query: &str, limit: u16) -> Result<Vec<BlockSummary>, ClientError> {
        self.require_enabled()?;
        validate_query(query)?;
        if limit == 0 || limit > MAX_SEARCH_RESULTS {
            return Err(ClientError::InvalidLimit);
        }
        match self
            .transport
            .send(BrokerRequest::SearchBlocks { query, limit })?
        {
            BrokerResponse::SearchResults(results) => {
                if results.len() > usize::from(limit)
                    || results
                        .iter()
                        .any(|block| block.content.len() > MAX_BLOCK_CONTENT_BYTES)
                {
                    Err(ClientError::ResponseTooLarge)
                } else {
                    Ok(results)
                }
            }
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }

    pub fn get_block(&self, id: &str) -> Result<Block, ClientError> {
        self.require_enabled()?;
        validate_identifier(id)?;
        match self.transport.send(BrokerRequest::GetBlock { id })? {
            BrokerResponse::Block(block) if block.markdown.len() <= MAX_BLOCK_CONTENT_BYTES => {
                Ok(block)
            }
            BrokerResponse::Block(_) => Err(ClientError::ResponseTooLarge),
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }
}

fn validate_identifier(value: &str) -> Result<(), ClientError> {
    if value.is_empty()
        || value.len() > MAX_IDENTIFIER_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        Err(ClientError::InvalidIdentifier)
    } else {
        Ok(())
    }
}

fn validate_query(value: &str) -> Result<(), ClientError> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > MAX_QUERY_BYTES
        || trimmed.chars().any(char::is_control)
    {
        Err(ClientError::InvalidQuery)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct MockTransport {
        requests: RefCell<Vec<String>>,
        response: BrokerResponse,
    }

    impl MockTransport {
        fn new(response: BrokerResponse) -> Self {
            Self {
                requests: RefCell::new(Vec::new()),
                response,
            }
        }
    }

    impl SiyuanTransport for MockTransport {
        fn send(&self, request: BrokerRequest<'_>) -> Result<BrokerResponse, ClientError> {
            let request = match request {
                BrokerRequest::Status => "status".to_owned(),
                BrokerRequest::Version => "version".to_owned(),
                BrokerRequest::ListNotebooks => "list_notebooks".to_owned(),
                BrokerRequest::SearchBlocks { query, limit } => format!("search:{query}:{limit}"),
                BrokerRequest::GetBlock { id } => format!("get:{id}"),
            };
            self.requests.borrow_mut().push(request);
            Ok(self.response.clone())
        }
    }

    #[test]
    fn disabled_client_never_reaches_transport() {
        let transport = MockTransport::new(BrokerResponse::Status(RuntimeStatus {
            state: "ready".to_owned(),
            runtime_bundled: true,
        }));
        let client = SiyuanClient::new(false, transport);
        assert_eq!(client.status(), Err(ClientError::FeatureDisabled));
        assert!(client.transport.requests.borrow().is_empty());
    }

    #[test]
    fn typed_search_emits_only_the_closed_broker_request() {
        let transport = MockTransport::new(BrokerResponse::SearchResults(vec![BlockSummary {
            id: "block-1".to_owned(),
            notebook_id: "notebook-1".to_owned(),
            path: "/spec".to_owned(),
            content: "Pinned v3.8.1".to_owned(),
        }]));
        let client = SiyuanClient::new(true, transport);
        let result = client
            .search_blocks("pinned", 10)
            .expect("typed search response");
        assert_eq!(result[0].id, "block-1");
        assert_eq!(
            client.transport.requests.borrow().as_slice(),
            ["search:pinned:10"]
        );
    }

    #[test]
    fn request_bounds_are_enforced_before_transport() {
        let transport = MockTransport::new(BrokerResponse::SearchResults(Vec::new()));
        let client = SiyuanClient::new(true, transport);
        assert_eq!(
            client.search_blocks("select\n*", 10),
            Err(ClientError::InvalidQuery)
        );
        assert_eq!(
            client.search_blocks("ok", 0),
            Err(ClientError::InvalidLimit)
        );
        assert!(client.transport.requests.borrow().is_empty());
    }

    #[test]
    fn response_variants_and_payload_sizes_are_fail_closed() {
        let mismatch = SiyuanClient::new(
            true,
            MockTransport::new(BrokerResponse::Version(RuntimeVersion {
                version: "3.8.1".to_owned(),
                commit: "afa823b6".to_owned(),
            })),
        );
        assert_eq!(mismatch.status(), Err(ClientError::ResponseTypeMismatch));

        let too_large = SiyuanClient::new(
            true,
            MockTransport::new(BrokerResponse::Block(Block {
                id: "block-1".to_owned(),
                notebook_id: "notebook-1".to_owned(),
                path: "/spec".to_owned(),
                markdown: "x".repeat(MAX_BLOCK_CONTENT_BYTES + 1),
            })),
        );
        assert_eq!(
            too_large.get_block("block-1"),
            Err(ClientError::ResponseTooLarge)
        );
    }

    #[test]
    fn errors_are_stable_codes_without_transport_or_token_detail() {
        let rendered = ClientError::TransportUnavailable.to_string();
        assert_eq!(rendered, "siyuan_transport_unavailable");
        assert!(!rendered.contains("token"));
        assert!(!rendered.contains("http"));
    }
}
